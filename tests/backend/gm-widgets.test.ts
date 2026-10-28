import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { defaultWidgetStyle } from '../../shared/gm'
import { readScreen } from '../helpers/gm-screen'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

afterEach(() => vi.useRealTimers())

async function setup() {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(
    backend,
    'widget-alice@example.test'
  )
  const bob = await createAuthenticatedUser(backend, 'widget-bob@example.test')
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'Campagne',
  })
  const screenId = await alice.client.mutation(api.gm.createScreen, {
    projectId,
    title: 'Écran',
    format: 'digital',
  })
  const noteId = await alice.client.mutation(api.gm.addNote, { screenId })
  const read = async () => {
    const data = await readScreen(alice.client, { id: screenId })
    if (!data) throw new Error('Missing Screen')
    return data
  }
  const profile = async () => {
    const layout = (await read()).layouts.find((p) => p.kind === 'digital')
    if (!layout) throw new Error('Missing layout')
    return layout
  }
  const request = async (operation: 'duplicate' | 'trash') => ({
    layoutId: (await profile())._id,
    expectedVersion: (await profile()).version,
    notes: [
      {
        id: noteId,
        version:
          (await read()).notes.find((n) => n._id === noteId)?.version ?? 0,
      },
    ],
    operation,
  })
  return {
    backend,
    alice,
    bob,
    projectId,
    screenId,
    noteId,
    read,
    profile,
    request,
  }
}

describe('Widget lifecycle and presentation', () => {
  it('paginates a full trash independently of active capacity and refuses overflowing deletion', async () => {
    const { backend, alice, screenId, projectId, noteId, request } =
      await setup()
    await backend.run(async (ctx) => {
      for (let index = 0; index < 100; index++) {
        const widgetId = await ctx.db.insert('gmNotes', {
          ownerId: alice.userId,
          projectId,
          screenId,
          formatVersion: 2,
          kind: 'note',
          config: {},
          state: {},
          version: 1,
          deletedAt: Date.now(),
          updatedAt: Date.now(),
        })
        await ctx.db.insert('gmWidgetContents', {
          ownerId: alice.userId,
          projectId,
          screenId,
          widgetId,
          body: `Supprimée ${index}`,
          updatedAt: Date.now(),
          formatVersion: 2,
        })
      }
    })
    await expect(
      alice.client.mutation(api.gmWidgets.changeNotes, await request('trash'))
    ).rejects.toThrow('TRASH_LIMIT')
    const added = await alice.client.mutation(api.gm.addNote, { screenId })
    expect(added).not.toBe(noteId)
    const page = await alice.client.query(api.gmWidgets.listTrash, {
      screenId,
      paginationOpts: { cursor: null, numItems: 100 },
    })
    expect(page.page).toHaveLength(10)
    expect(page.isDone).toBe(false)
    const trashed = page.page[0]
    if (!trashed) throw new Error('Missing trashed note')
    await alice.client.mutation(api.gmWidgets.purgeNote, {
      id: trashed._id,
      expectedVersion: trashed.version,
      confirmation: 'DELETE_NOTE',
    })
    await alice.client.mutation(
      api.gmWidgets.changeNotes,
      await request('trash')
    )
  })
  it('duplicates independent content and each profile geometry/style; trash restores placements without reviving groups', async () => {
    const { alice, noteId, read, profile, request, screenId } = await setup()
    await alice.client.mutation(api.gm.updateNote, {
      id: noteId,
      expectedVersion: 0,
      body: 'Référence commune',
    })
    const layout = await profile()
    await alice.client.mutation(api.gmEditor.updateLayout, {
      id: layout._id,
      expectedVersion: layout.version,
      name: layout.name,
      width: layout.width,
      height: layout.height,
      placements: layout.placements.map((p) => ({
        ...p,
        x: 400,
        style: { ...defaultWidgetStyle, background: '#123456' },
        groupId: 'example',
      })),
    })
    const [copyId] = await alice.client.mutation(
      api.gmWidgets.changeNotes,
      await request('duplicate')
    )
    if (!copyId) throw new Error('Missing duplicate')
    expect((await read()).notes).toHaveLength(2)
    expect(
      (await profile()).placements.find((p) => p.widgetId === copyId)
    ).toMatchObject({ x: 424, style: { background: '#123456' } })
    await alice.client.mutation(api.gm.updateNote, {
      id: copyId,
      expectedVersion: 0,
      body: 'Copie indépendante',
    })
    expect((await read()).notes.find((n) => n._id === noteId)?.body).toBe(
      'Référence commune'
    )
    const before = await read()
    await alice.client.mutation(
      api.gmWidgets.changeNotes,
      await request('trash')
    )
    expect((await read()).notes.map((n) => n._id)).toEqual([copyId])
    expect(
      (await read()).layouts.every((p) =>
        p.placements.every((item) => item.widgetId !== noteId)
      )
    ).toBe(true)
    await expect(
      alice.client.mutation(api.gm.updateNote, {
        id: noteId,
        expectedVersion: 2,
        body: 'Revive',
      })
    ).rejects.toThrow('NOT_FOUND')
    const trash = await alice.client.query(api.gmWidgets.listTrash, {
      screenId,
      paginationOpts: { cursor: null, numItems: 50 },
    })
    expect(trash.page[0]).toMatchObject({
      _id: noteId,
      kind: 'note',
      version: 2,
    })
    const exported = await alice.client.query(api.gm.exportCollection, {
      collection: 'gmNotes',
      paginationOpts: { cursor: null, numItems: 50 },
    })
    const exportedNote = exported.page.find((n) => n._id === noteId)
    expect(
      exportedNote && 'deletedAt' in exportedNote
        ? typeof exportedNote.deletedAt
        : undefined
    ).toBe('number')
    await alice.client.mutation(api.gmWidgets.restoreNote, {
      id: noteId,
      expectedVersion: 2,
    })
    expect((await read()).notes.find((n) => n._id === noteId)).toMatchObject({
      body: 'Référence commune',
      version: 3,
    })
    for (const original of before.layouts) {
      const restored = (await read()).layouts
        .find((p) => p._id === original._id)
        ?.placements.find((p) => p.widgetId === noteId)
      const previous = original.placements.find((p) => p.widgetId === noteId)
      expect(restored).toMatchObject({
        x: previous?.x,
        y: previous?.y,
        width: previous?.width,
        height: previous?.height,
      })
      expect(restored?.groupId).toBeUndefined()
    }
  })
  it('refuses foreign, anonymous, stale and locked lifecycle writes atomically', async () => {
    const { backend, alice, bob, noteId, screenId, profile, request, read } =
      await setup()
    const stale = await request('trash')
    await alice.client.mutation(api.gm.updateNote, {
      id: noteId,
      expectedVersion: 0,
      body: 'Nouvelle version',
    })
    await expect(
      alice.client.mutation(api.gmWidgets.changeNotes, stale)
    ).rejects.toThrow('CONFLICT')
    const valid = await request('trash')
    await expect(
      bob.client.mutation(api.gmWidgets.changeNotes, valid)
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      backend.mutation(api.gmWidgets.changeNotes, valid)
    ).rejects.toThrow()
    await expect(
      bob.client.query(api.gmWidgets.listTrash, {
        screenId,
        paginationOpts: { cursor: null, numItems: 5 },
      })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      alice.client.mutation(api.gmWidgets.changeNotes, {
        ...valid,
        notes: [...valid.notes, ...valid.notes],
      })
    ).rejects.toThrow('INVALID_INPUT')
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: true,
    })
    await expect(
      alice.client.mutation(api.gmWidgets.changeNotes, valid)
    ).rejects.toThrow('LAYOUT_LOCKED')
    expect((await read()).notes).toHaveLength(1)
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: false,
    })
    await alice.client.mutation(api.gmWidgets.changeNotes, {
      ...valid,
      expectedVersion: (await profile()).version,
    })
    await expect(
      bob.client.mutation(api.gmWidgets.restoreNote, {
        id: noteId,
        expectedVersion: 2,
      })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      alice.client.mutation(api.gmWidgets.restoreNote, {
        id: noteId,
        expectedVersion: 1,
      })
    ).rejects.toThrow('CONFLICT')
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: true,
    })
    await expect(
      alice.client.mutation(api.gmWidgets.restoreNote, {
        id: noteId,
        expectedVersion: 2,
      })
    ).rejects.toThrow('LAYOUT_LOCKED')
  })
  it('validates style allowlists, bounds and grouping while old records remain editable', async () => {
    const { alice, profile } = await setup()
    const layout = await profile()
    const base = {
      id: layout._id,
      expectedVersion: layout.version,
      name: layout.name,
      width: layout.width,
      height: layout.height,
    }
    for (const invalid of [
      { ...defaultWidgetStyle, background: 'url(https://attacker.test)' },
      { ...defaultWidgetStyle, fontSize: 100 },
      { ...defaultWidgetStyle, opacity: 0 },
      { ...defaultWidgetStyle, radius: Number.NaN },
    ]) {
      await expect(
        alice.client.mutation(api.gmEditor.updateLayout, {
          ...base,
          placements: layout.placements.map((p) => ({ ...p, style: invalid })),
        })
      ).rejects.toThrow('INVALID_INPUT')
    }
    await expect(
      alice.client.mutation(api.gmEditor.updateLayout, {
        ...base,
        placements: layout.placements.map((p) => ({
          ...p,
          groupId: 'x'.repeat(81),
        })),
      })
    ).rejects.toThrow('INVALID_INPUT')
    await alice.client.mutation(api.gmEditor.updateLayout, {
      ...base,
      placements: layout.placements,
    })
    expect((await profile()).version).toBe(layout.version)
  })
  it('purges only trash, removes its history and never resurrects it from old layout revisions', async () => {
    const { alice, bob, noteId, screenId, request, profile, read } =
      await setup()
    await expect(
      alice.client.mutation(api.gmWidgets.purgeNote, {
        id: noteId,
        expectedVersion: 0,
        confirmation: 'DELETE_NOTE',
      })
    ).rejects.toThrow('NOT_FOUND')
    await alice.client.mutation(api.gm.updateNote, {
      id: noteId,
      expectedVersion: 0,
      body: 'Old text',
    })
    await alice.client.mutation(
      api.gmWidgets.changeNotes,
      await request('trash')
    )
    await expect(
      bob.client.mutation(api.gmWidgets.purgeNote, {
        id: noteId,
        expectedVersion: 2,
        confirmation: 'DELETE_NOTE',
      })
    ).rejects.toThrow('NOT_FOUND')
    await alice.client.mutation(api.gmWidgets.purgeNote, {
      id: noteId,
      expectedVersion: 2,
      confirmation: 'DELETE_NOTE',
    })
    const layout = await profile()
    const revision = (
      await alice.client.query(api.gmEditor.listHistory, {
        target: { kind: 'layout', id: layout._id },
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page[0]
    if (!revision) throw new Error('Missing layout history')
    await alice.client.mutation(api.gmEditor.restoreRevision, {
      id: revision._id,
      expectedVersion: layout.version,
    })
    expect((await read()).notes).toHaveLength(0)
    expect((await profile()).placements).toHaveLength(0)
    expect(
      (
        await alice.client.query(api.gm.exportCollection, {
          collection: 'gmEditorHistory',
          paginationOpts: { cursor: null, numItems: 50 },
        })
      ).page.some((n) => 'subjectId' in n && n.subjectId === noteId)
    ).toBe(false)
    expect(
      (
        await alice.client.query(api.gmWidgets.listTrash, {
          screenId,
          paginationOpts: { cursor: null, numItems: 5 },
        })
      ).page
    ).toHaveLength(0)
  })
  it('cleans trashed notes and placements with the account', async () => {
    vi.useFakeTimers()
    const { backend, alice, noteId, request } = await setup()
    await alice.client.mutation(
      api.gmWidgets.changeNotes,
      await request('trash')
    )
    await backend.run((ctx) =>
      ctx.db.insert('cleanupJobs', {
        kind: 'account',
        userId: alice.userId,
        email: 'widget-alice@example.test',
        retryAt: 0,
      })
    )
    await backend.mutation(internal.cleanup.deletedAccount, {
      userId: alice.userId,
      email: 'widget-alice@example.test',
    })
    await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
    expect(await backend.run((ctx) => ctx.db.get('gmNotes', noteId))).toBeNull()
  })
})

// Observable regression: a maximum 20-note copy must retain all 8 profile
// histories and never read 100 inline bodies just to count capacity.
// convex-test doesn't enforce service read budgets; CI owns that proof.
it('copies twenty full payloads with eight full histories and cleans all heavy tables in bounded passes', async () => {
  vi.useFakeTimers()
  const { backend, alice, screenId, projectId, noteId, profile } = await setup()
  const sources = await backend.run(async (ctx) => {
    const common = {
      ownerId: alice.userId,
      projectId,
      screenId,
      updatedAt: Date.now(),
    }
    const body = '界'.repeat(50_000)
    await ctx.db.delete('gmNotes', noteId)
    const oldContents = await ctx.db.query('gmWidgetContents').collect()
    for (const content of oldContents)
      await ctx.db.delete('gmWidgetContents', content._id)
    const ids = []
    for (let index = 0; index < 180; index++) {
      const id = await ctx.db.insert('gmNotes', {
        ...common,
        formatVersion: 2,
        kind: 'note',
        config: {},
        state: {},
        version: 20,
        ...(index >= 80 ? { deletedAt: Date.now() } : {}),
      })
      ids.push(id)
      await ctx.db.insert('gmWidgetContents', {
        ...common,
        formatVersion: 2,
        widgetId: id,
        body,
      })
      if (index < 20)
        for (let version = 0; version < 20; version++)
          await ctx.db.insert('gmEditorHistory', {
            ...common,
            formatVersion: 2,
            subjectId: id,
            version,
            snapshot: { kind: 'note', config: {}, state: {}, body },
          })
    }
    const layouts = await ctx.db.query('gmLayouts').collect()
    const source = layouts.find((p) => p.kind === 'digital')
    if (!source) throw new Error('Missing layout')
    for (let index = 0; index < 6; index++) {
      const id = await ctx.db.insert('gmLayouts', {
        ...common,
        formatVersion: 2,
        kind: 'digital',
        unit: 'px',
        name: `P${index}`,
        width: 1920,
        height: 1080,
        placements: [],
        version: 20,
      })
      layouts.push({ ...source, _id: id })
    }
    const placements = ids.slice(0, 100).map((widgetId, index) => ({
      widgetId,
      x: 24,
      y: 24,
      width: 400,
      height: 240,
      layer: index,
      groupId: 'full',
      style: defaultWidgetStyle,
    }))
    for (const layout of layouts) {
      await ctx.db.patch('gmLayouts', layout._id, {
        formatVersion: 2,
        placements: placements.slice(0, 80),
        version: 20,
      })
      for (let version = 0; version < 20; version++)
        await ctx.db.insert('gmEditorHistory', {
          ...common,
          formatVersion: 2,
          subjectId: layout._id,
          version,
          snapshot: {
            kind: 'layout',
            name: layout.name,
            width: layout.width,
            height: layout.height,
            placements,
          },
        })
    }
    for (let index = 0; index < 6; index++) {
      const sheetId = await ctx.db.insert('gmSheets', {
        ownerId: alice.userId,
        projectId,
        updatedAt: Date.now(),
        kind: 'note',
        title: 'Pleine',
        summary: '',
        version: 0,
      })
      await ctx.db.insert('gmSheetContents', {
        ownerId: alice.userId,
        projectId,
        updatedAt: Date.now(),
        sheetId,
        body,
        fields: Array.from({ length: 40 }, () => ({
          label: '界'.repeat(60),
          value: '界'.repeat(2000),
        })),
      })
    }
    return ids.slice(0, 20)
  })
  const layout = await profile()
  const copies = await alice.client.mutation(api.gmWidgets.changeNotes, {
    layoutId: layout._id,
    expectedVersion: layout.version,
    operation: 'duplicate',
    notes: sources.map((id) => ({ id, version: 20 })),
  })
  expect(copies).toHaveLength(20)
  const metadata = await alice.client.query(api.gmWidgets.listScreenWidgets, {
    screenId,
    paginationOpts: { cursor: null, numItems: 100 },
  })
  expect(metadata.page).toHaveLength(10)
  expect(metadata.page.every((n) => !('body' in n))).toBe(true)
  for (const id of copies)
    expect(
      await alice.client.query(api.gmWidgets.getNoteContent, { id })
    ).toEqual({ version: 0, body: '界'.repeat(50_000), bodyFormat: 'plain' })
  for (const collection of [
    'gmNotes',
    'gmWidgetContents',
    'gmEditorHistory',
    'gmSheetContents',
  ] as const) {
    const page = await alice.client.query(api.gm.exportCollection, {
      collection,
      paginationOpts: { cursor: null, numItems: 100 },
    })
    expect(page.page.length).toBeLessThanOrEqual(10)
  }
  await backend.mutation(internal.cleanup.deletedAccount, {
    userId: alice.userId,
    email: 'widget-alice@example.test',
  })
  await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
  for (const table of [
    'gmNotes',
    'gmWidgetContents',
    'gmEditorHistory',
    'gmLayouts',
    'gmSheetContents',
  ] as const)
    expect(await backend.run((ctx) => ctx.db.query(table).collect())).toEqual(
      []
    )
})

it('shares typed note writes with legacy facades without duplicating payloads or no-op history', async () => {
  const { backend, alice, screenId } = await setup()
  const id = await alice.client.mutation(api.gmWidgets.addWidget, {
    screenId,
    kind: 'note',
  })
  const args = {
    id,
    expectedVersion: 0,
    widget: {
      kind: 'note' as const,
      config: {},
      state: {},
      body: 'Texte typé 😀',
    },
  }
  expect(await alice.client.mutation(api.gmWidgets.updateWidget, args)).toBe(1)
  expect(
    await alice.client.mutation(api.gm.updateNote, {
      id,
      expectedVersion: 1,
      body: args.widget.body,
    })
  ).toBe(1)
  const payloads = await backend.run((ctx) =>
    ctx.db
      .query('gmWidgetContents')
      .withIndex('by_widget', (q) => q.eq('widgetId', id))
      .collect()
  )
  expect(payloads).toHaveLength(1)
  expect(payloads[0]?.body).toBe(args.widget.body)
  const history = await alice.client.query(api.gmEditor.listHistory, {
    target: { kind: 'note', id },
    paginationOpts: { cursor: null, numItems: 10 },
  })
  expect(history.page).toHaveLength(1)
  expect(history.page[0]).toMatchObject({
    formatVersion: 2,
    snapshot: { kind: 'note', config: {}, state: {}, body: '' },
  })
})

// F3b: exercise public mutations; F3a tests above own note migration/budgets.
describe('Typed widgets', () => {
  it('creates only V2, shares placements and enforces checklist state, conflicts and locking', async () => {
    const { alice, bob, backend, screenId, read } = await setup()
    const id = await alice.client.mutation(api.gmWidgets.addWidget, {
      screenId,
      kind: 'checklist',
    })
    const config = {
      title: 'Préparation',
      items: [
        { id: 'a', label: 'Torches' },
        { id: 'b', label: 'Cordes' },
      ],
    }
    expect(
      await alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 0,
        widget: { kind: 'checklist', config, state: { checkedIds: [] } },
      })
    ).toBe(1)
    expect(
      await alice.client.mutation(api.gmWidgets.setChecklistItem, {
        id,
        expectedVersion: 1,
        itemId: 'a',
        checked: true,
      })
    ).toBe(2)
    await expect(
      alice.client.mutation(api.gmWidgets.setChecklistItem, {
        id,
        expectedVersion: 1,
        itemId: 'a',
        checked: false,
      })
    ).rejects.toThrow('CONFLICT')
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 2,
      widget: {
        kind: 'checklist',
        config: {
          ...config,
          items: [...config.items].sort((a, b) => b.id.localeCompare(a.id)),
        },
        state: { checkedIds: ['a'] },
      },
    })
    let widget = (await read()).notes.find((entry) => entry._id === id)
    expect(widget).toMatchObject({
      formatVersion: 2,
      kind: 'checklist',
      state: { checkedIds: ['a'] },
      version: 3,
    })
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: true,
    })
    await alice.client.mutation(api.gmWidgets.setChecklistItem, {
      id,
      expectedVersion: 3,
      itemId: 'b',
      checked: true,
    })
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 4,
        widget: { kind: 'checklist', config, state: { checkedIds: [] } },
      })
    ).rejects.toThrow('LAYOUT_LOCKED')
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: false,
    })
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 4,
      widget: {
        kind: 'checklist',
        config: {
          ...config,
          items: [config.items[1] ?? { id: 'b', label: 'Cordes' }],
        },
        state: { checkedIds: ['a', 'b'] },
      },
    })
    widget = (await read()).notes.find((entry) => entry._id === id)
    expect(widget?.state).toEqual({ checkedIds: ['b'] })
    for (const client of [bob.client, backend]) {
      await expect(
        client.mutation(api.gmWidgets.addWidget, { screenId, kind: 'dice' })
      ).rejects.toThrow()
      await expect(
        client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 5,
          widget: { kind: 'checklist', config, state: { checkedIds: [] } },
        })
      ).rejects.toThrow()
      await expect(
        client.mutation(api.gmWidgets.setChecklistItem, {
          id,
          expectedVersion: 5,
          itemId: 'b',
          checked: false,
        })
      ).rejects.toThrow()
      await expect(
        client.mutation(api.gmWidgets.setCounterValue, {
          id,
          expectedVersion: 5,
          value: 1,
        })
      ).rejects.toThrow()
    }
    await expect(
      alice.client.query(api.gmWidgets.getNoteContent, { id })
    ).rejects.toThrow('NOT_FOUND')
    for (const items of [
      [{ id: 'a', label: '' }],
      [{ id: 'é', label: 'x' }],
      [
        { id: 'a', label: 'x' },
        { id: 'a', label: 'y' },
      ],
    ])
      await expect(
        alice.client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 5,
          widget: {
            kind: 'checklist',
            config: { title: '', items },
            state: { checkedIds: [] },
          },
        })
      ).rejects.toThrow('INVALID_INPUT')
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 5,
        widget: {
          kind: 'checklist',
          config,
          state: { checkedIds: ['missing'] },
        },
      })
    ).rejects.toThrow('INVALID_INPUT')
  })

  it('keeps linked counters on the F2 source, validates references and restores only configurations', async () => {
    const { alice, bob, screenId, projectId, read } = await setup()
    const id = await alice.client.mutation(api.gmWidgets.addWidget, {
      screenId,
      kind: 'counter',
    })
    const local = {
      title: 'PV',
      source: { type: 'local' as const, step: 1, min: 0, max: 10 },
    }
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 0,
      widget: { kind: 'counter', config: local, state: { value: 2 } },
    })
    for (const value of [-1, 11, Infinity, Number.NaN])
      await expect(
        alice.client.mutation(api.gmWidgets.setCounterValue, {
          id,
          expectedVersion: 1,
          value,
        })
      ).rejects.toThrow('INVALID_INPUT')
    await expect(
      alice.client.mutation(api.gmWidgets.setCounterValue, {
        id,
        expectedVersion: 0,
        value: 3,
      })
    ).rejects.toThrow('CONFLICT')
    const variableId = await alice.client.mutation(
      api.gmVariables.createVariable,
      {
        projectId,
        name: 'pv',
        label: 'Vie',
        definition: { type: 'number', value: 4, min: 0, max: 10 },
      }
    )
    const linked = {
      title: 'PV',
      source: { type: 'variable' as const, variableId, step: 1 },
    }
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 1,
      widget: { kind: 'counter', config: linked, state: {} },
    })
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: true,
    })
    await alice.client.mutation(api.gmVariables.setVariableValue, {
      id: variableId,
      value: 5,
    })
    await expect(
      alice.client.mutation(api.gmVariables.updateVariable, {
        id: variableId,
        expectedVersion: 0,
        name: 'pv',
        label: 'Vie',
        definition: { type: 'number', value: 7 },
      })
    ).rejects.toThrow('CONFLICT')
    expect(
      (await read()).notes.find((entry) => entry._id === id)
    ).toMatchObject({ version: 2, state: {} })
    await expect(
      alice.client.mutation(api.gmWidgets.setCounterValue, {
        id,
        expectedVersion: 2,
        value: 6,
      })
    ).rejects.toThrow('INVALID_INPUT')
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: false,
    })
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 2,
      widget: { kind: 'counter', config: local, state: { value: 0 } },
    })
    expect(
      (await read()).notes.find((entry) => entry._id === id)?.state
    ).toEqual({ value: 5 })
    const history = await alice.client.query(api.gmEditor.listHistory, {
      target: { kind: 'note', id },
      paginationOpts: { numItems: 10, cursor: null },
    })
    const revision = history.page.find(
      (entry) =>
        entry.snapshot.kind === 'counter' &&
        entry.snapshot.config.source.type === 'variable'
    )
    if (!revision) throw new Error('Missing linked revision')
    await alice.client.mutation(api.gmEditor.restoreRevision, {
      id: revision._id,
      expectedVersion: 3,
    })
    expect(
      (
        await alice.client.query(api.gmVariables.listVariables, { projectId })
      )[0]?.variable
    ).toMatchObject({ value: 5, version: 1 })
    const layout = (await read()).layouts.find(
      (entry) => entry.kind === 'digital'
    )
    if (!layout) throw new Error('Missing digital layout')
    const [copyId] = await alice.client.mutation(api.gmWidgets.changeNotes, {
      layoutId: layout._id,
      expectedVersion: layout.version,
      notes: [{ id, version: 4 }],
      operation: 'duplicate',
    })
    if (!copyId) throw new Error('Missing linked copy')
    expect(
      (await read()).notes.find((entry) => entry._id === copyId)
    ).toMatchObject({ config: linked, state: {} })
    const changedLayout = (await read()).layouts.find(
      (entry) => entry._id === layout._id
    )
    if (!changedLayout) throw new Error('Missing changed layout')
    await alice.client.mutation(api.gmWidgets.changeNotes, {
      layoutId: layout._id,
      expectedVersion: changedLayout.version,
      notes: [{ id: copyId, version: 0 }],
      operation: 'trash',
    })
    await alice.client.mutation(api.gmWidgets.purgeNote, {
      id: copyId,
      expectedVersion: 1,
      confirmation: 'DELETE_NOTE',
    })
    expect(
      (
        await alice.client.query(api.gmVariables.listVariables, { projectId })
      )[0]?.variable
    ).toMatchObject({ value: 5, version: 1 })
    await alice.client.mutation(api.gmVariables.deleteVariable, {
      id: variableId,
    })
    await expect(
      alice.client.mutation(api.gmEditor.restoreRevision, {
        id: revision._id,
        expectedVersion: 4,
      })
    ).rejects.toThrow('INVALID_INPUT')
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 4,
      widget: { kind: 'counter', config: local, state: { value: 3 } },
    })
    const anotherProject = await alice.client.mutation(api.gm.createProject, {
      title: 'Autre projet',
    })
    const bobProject = await bob.client.mutation(api.gm.createProject, {
      title: 'Bob',
    })
    for (const [client, project] of [
      [alice.client, anotherProject],
      [bob.client, bobProject],
    ] as const) {
      const foreign = await client.mutation(api.gmVariables.createVariable, {
        projectId: project,
        name: 'foreign',
        label: '',
        definition: { type: 'number', value: 1 },
      })
      await expect(
        alice.client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 5,
          widget: {
            kind: 'counter',
            config: {
              ...linked,
              source: { ...linked.source, variableId: foreign },
            },
            state: {},
          },
        })
      ).rejects.toThrow('INVALID_INPUT')
    }
    const formula = await alice.client.mutation(
      api.gmVariables.createVariable,
      {
        projectId,
        name: 'formula',
        label: '',
        definition: { type: 'formula', expression: '1+1' },
      }
    )
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 5,
        widget: {
          kind: 'counter',
          config: {
            ...linked,
            source: { ...linked.source, variableId: formula },
          },
          state: {},
        },
      })
    ).rejects.toThrow('INVALID_INPUT')
  })

  it('copies, trashes, restores and purges all new kinds without payloads or variable deletion', async () => {
    const { alice, backend, screenId, read, profile } = await setup()
    for (const kind of ['checklist', 'counter', 'dice'] as const) {
      const id = await alice.client.mutation(api.gmWidgets.addWidget, {
        screenId,
        kind,
      })
      let layout = await profile()
      const copies = await alice.client.mutation(api.gmWidgets.changeNotes, {
        layoutId: layout._id,
        expectedVersion: layout.version,
        notes: [{ id, version: 0 }],
        operation: 'duplicate',
      })
      expect(copies).toHaveLength(1)
      const copyId = copies[0]
      if (!copyId) throw new Error('Missing copy')
      expect(
        (await read()).notes.find((entry) => entry._id === copyId)
      ).toMatchObject({ formatVersion: 2, kind, version: 0 })
      layout = await profile()
      await alice.client.mutation(api.gmWidgets.changeNotes, {
        layoutId: layout._id,
        expectedVersion: layout.version,
        notes: [{ id: copyId, version: 0 }],
        operation: 'trash',
      })
      const trash = await alice.client.query(api.gmWidgets.listTrash, {
        screenId,
        paginationOpts: { numItems: 10, cursor: null },
      })
      expect(trash.page.find((entry) => entry._id === copyId)?.kind).toBe(kind)
      await alice.client.mutation(api.gmWidgets.restoreNote, {
        id: copyId,
        expectedVersion: 1,
      })
      layout = await profile()
      await alice.client.mutation(api.gmWidgets.changeNotes, {
        layoutId: layout._id,
        expectedVersion: layout.version,
        notes: [{ id: copyId, version: 2 }],
        operation: 'trash',
      })
      await alice.client.mutation(api.gmWidgets.purgeNote, {
        id: copyId,
        expectedVersion: 3,
        confirmation: 'DELETE_NOTE',
      })
      expect(
        await backend.run((ctx) => ctx.db.get('gmNotes', copyId))
      ).toBeNull()
      expect(
        await backend.run((ctx) =>
          ctx.db
            .query('gmWidgetContents')
            .withIndex('by_widget', (q) => q.eq('widgetId', id))
            .unique()
        )
      ).toBeNull()
    }
    const dice = await alice.client.mutation(api.gmWidgets.addWidget, {
      screenId,
      kind: 'dice',
    })
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id: dice,
        expectedVersion: 0,
        widget: {
          kind: 'dice',
          config: { title: '', expression: '101d6' },
          state: {},
        },
      })
    ).rejects.toThrow('INVALID_INPUT')
    expect(
      await alice.client.mutation(api.gmWidgets.updateWidget, {
        id: dice,
        expectedVersion: 0,
        widget: {
          kind: 'dice',
          config: { title: '', expression: '2d6+1' },
          state: {},
        },
      })
    ).toBe(1)
    expect(
      await alice.client.mutation(api.gmWidgets.updateWidget, {
        id: dice,
        expectedVersion: 1,
        widget: {
          kind: 'dice',
          config: { title: '', expression: '2d6+1' },
          state: {},
        },
      })
    ).toBe(1)
  })
})

it('enforces shared mixed capacity and counter invariants, including unavailable source type changes', async () => {
  const { backend, alice, screenId, projectId, read } = await setup()
  const id = await alice.client.mutation(api.gmWidgets.addWidget, {
    screenId,
    kind: 'counter',
  })
  for (const source of [
    { type: 'local' as const, step: 0 },
    { type: 'local' as const, step: Infinity },
    { type: 'local' as const, step: 1, min: 5, max: 4 },
  ])
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 0,
        widget: {
          kind: 'counter',
          config: { title: '', source },
          state: { value: 0 },
        },
      })
    ).rejects.toThrow('INVALID_INPUT')
  await expect(
    alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 0,
      widget: {
        kind: 'dice',
        config: { title: '', expression: '1d20' },
        state: {},
      },
    })
  ).rejects.toThrow('INVALID_INPUT')
  for (const expectedVersion of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1])
    await expect(
      alice.client.mutation(api.gmWidgets.setCounterValue, {
        id,
        expectedVersion,
        value: 1,
      })
    ).rejects.toThrow('INVALID_INPUT')
  const variableId = await alice.client.mutation(
    api.gmVariables.createVariable,
    {
      projectId,
      name: 'source',
      label: '',
      definition: { type: 'number', value: 1 },
    }
  )
  await alice.client.mutation(api.gmWidgets.updateWidget, {
    id,
    expectedVersion: 0,
    widget: {
      kind: 'counter',
      config: { title: '', source: { type: 'variable', variableId, step: 1 } },
      state: {},
    },
  })
  await alice.client.mutation(api.gmVariables.updateVariable, {
    id: variableId,
    expectedVersion: 0,
    name: 'renamed',
    label: '',
    definition: { type: 'number', value: 3 },
  })
  expect((await read()).notes.find((entry) => entry._id === id)).toMatchObject({
    version: 1,
    config: { source: { variableId } },
  })
  await alice.client.mutation(api.gmVariables.updateVariable, {
    id: variableId,
    expectedVersion: 1,
    name: 'renamed',
    label: '',
    definition: { type: 'text', value: 'texte' },
  })
  await expect(
    alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 1,
      widget: {
        kind: 'counter',
        config: {
          title: 'Titre',
          source: { type: 'variable', variableId, step: 1 },
        },
        state: {},
      },
    })
  ).rejects.toThrow('INVALID_INPUT')
  await alice.client.mutation(api.gmWidgets.updateWidget, {
    id,
    expectedVersion: 1,
    widget: {
      kind: 'counter',
      config: { title: '', source: { type: 'local', step: 1 } },
      state: { value: 6 },
    },
  })
  expect((await read()).notes.find((entry) => entry._id === id)?.state).toEqual(
    { value: 6 }
  )
  await backend.run(async (ctx) => {
    for (let index = 0; index < 98; index++)
      await ctx.db.insert('gmNotes', {
        ownerId: alice.userId,
        projectId,
        screenId,
        updatedAt: 0,
        version: 0,
        formatVersion: 2,
        kind: 'dice',
        config: { title: '', expression: '1d20' },
        state: {},
      })
  })
  for (const kind of ['note', 'checklist', 'counter', 'dice'] as const)
    await expect(
      alice.client.mutation(api.gmWidgets.addWidget, { screenId, kind })
    ).rejects.toThrow('SCREEN_LIMIT')
})

it('restores local counter state under lock while protecting configuration and safe versions', async () => {
  const { alice, screenId, read } = await setup()
  const id = await alice.client.mutation(api.gmWidgets.addWidget, {
    screenId,
    kind: 'counter',
  })
  const config = {
    title: 'PV',
    source: { type: 'local' as const, step: 2, min: 0, max: 10 },
  }
  await alice.client.mutation(api.gmWidgets.updateWidget, {
    id,
    expectedVersion: 0,
    widget: { kind: 'counter', config, state: { value: 4 } },
  })
  await alice.client.mutation(api.gmEditor.setLayoutLocked, {
    screenId,
    locked: true,
  })
  expect(
    await alice.client.mutation(api.gmWidgets.setCounterValue, {
      id,
      expectedVersion: 1,
      value: 6,
    })
  ).toBe(2)
  expect(
    await alice.client.mutation(api.gmWidgets.setCounterValue, {
      id,
      expectedVersion: 2,
      value: 6,
    })
  ).toBe(2)
  await expect(
    alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 2,
      widget: {
        kind: 'counter',
        config: { ...config, title: 'Changé' },
        state: { value: 8 },
      },
    })
  ).rejects.toThrow('LAYOUT_LOCKED')
  const history = await alice.client.query(api.gmEditor.listHistory, {
    target: { kind: 'note', id },
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(history.page).toHaveLength(2)
  const previous = history.page.find((entry) => entry.version === 1)
  const initial = history.page.find((entry) => entry.version === 0)
  if (!previous || !initial) throw new Error('Missing counter history')
  await alice.client.mutation(api.gmEditor.restoreRevision, {
    id: previous._id,
    expectedVersion: 2,
  })
  expect((await read()).notes.find((entry) => entry._id === id)).toMatchObject({
    version: 3,
    state: { value: 4 },
  })
  await expect(
    alice.client.mutation(api.gmEditor.restoreRevision, {
      id: initial._id,
      expectedVersion: 3,
    })
  ).rejects.toThrow('LAYOUT_LOCKED')
  await alice.client.mutation(api.gmEditor.setLayoutLocked, {
    screenId,
    locked: false,
  })
  await alice.client.mutation(api.gmEditor.restoreRevision, {
    id: initial._id,
    expectedVersion: 3,
  })
  expect((await read()).notes.find((entry) => entry._id === id)).toMatchObject({
    version: 4,
    state: { value: 0 },
  })
})
