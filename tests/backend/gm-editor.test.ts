import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, components, internal } from '../../convex/_generated/api'
import type { Doc } from '../../convex/_generated/dataModel'
import { GM_HISTORY_LIMIT } from '../../shared/gm'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

afterEach(() => vi.useRealTimers())

async function setup() {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'alice@example.test')
  const bob = await createAuthenticatedUser(backend, 'bob@example.test')
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'Campagne',
  })
  const screenId = await alice.client.mutation(api.gm.createScreen, {
    projectId,
    title: 'Écran',
    format: 'digital',
  })
  const noteId = await alice.client.mutation(api.gm.addNote, { screenId })
  const data = await alice.client.query(api.gm.getScreen, { id: screenId })
  const layout = data?.layouts.find((item) => item.kind === 'digital')
  const paper = data?.layouts.find((item) => item.kind === 'print')
  if (!layout || !paper) throw new Error('Missing fixture layouts')
  return { backend, alice, bob, projectId, screenId, noteId, layout, paper }
}

function change(layout: Doc<'gmLayouts'>, x = 300) {
  return {
    id: layout._id,
    expectedVersion: layout.version,
    name: layout.name,
    width: layout.width,
    height: layout.height,
    placements: layout.placements.map((p) => ({ ...p, x })),
  }
}

// These mutations own geometry, ownership, concurrency and durable history.
// Browser E2E separately proves real pointer/keyboard coordinates and autosave.
describe('Screen editor mutations', () => {
  it('restores an older layout without losing a note added afterwards', async () => {
    const { alice, screenId, layout, noteId } = await setup()
    const version = await alice.client.mutation(
      api.gmEditor.updateLayout,
      change(layout)
    )
    const revision = (
      await alice.client.query(api.gmEditor.listHistory, {
        target: { kind: 'layout', id: layout._id },
        paginationOpts: { numItems: 5, cursor: null },
      })
    ).page[0]
    if (!revision) throw new Error('Missing revision')
    const added = await alice.client.mutation(api.gm.addNote, { screenId })
    await alice.client.mutation(api.gmEditor.restoreRevision, {
      id: revision._id,
      expectedVersion: version + 1,
    })
    const result = await alice.client.query(api.gm.getScreen, { id: screenId })
    const restored = result?.layouts.find((item) => item._id === layout._id)
    expect(restored?.placements).toHaveLength(2)
    expect(restored?.placements.find((p) => p.noteId === noteId)?.x).toBe(24)
    expect(restored?.placements.some((p) => p.noteId === added)).toBe(true)
  })
  it('clones named profiles, preserves paper and shares only content between digital profiles', async () => {
    const { alice, screenId, noteId, layout, paper } = await setup()
    const profileId = await alice.client.mutation(api.gmEditor.createProfile, {
      sourceId: layout._id,
      name: ' Portable ',
    })
    await alice.client.mutation(api.gmEditor.updateLayout, {
      ...change(layout),
      width: 1440,
      height: 900,
    })
    await alice.client.mutation(api.gm.updateNote, {
      id: noteId,
      expectedVersion: 0,
      body: 'Commun aux profils',
    })
    const result = await alice.client.query(api.gm.getScreen, { id: screenId })
    expect(result?.layouts.find((p) => p._id === layout._id)).toMatchObject({
      width: 1440,
      height: 900,
      placements: [{ noteId, x: 300 }],
    })
    expect(result?.layouts.find((p) => p._id === profileId)).toMatchObject({
      name: 'Portable',
      width: 1920,
      placements: [{ noteId, x: 24 }],
    })
    expect(result?.layouts.find((p) => p._id === paper._id)).toEqual(paper)
    expect(result?.notes).toHaveLength(1)
    expect(result?.notes[0]?.body).toBe('Commun aux profils')
    await expect(
      alice.client.mutation(api.gmEditor.createProfile, {
        sourceId: layout._id,
        name: 'portable',
      })
    ).rejects.toThrow('LAYOUT_NAME_TAKEN')
  })

  it('refuses anonymous and foreign editing, history and cloning', async () => {
    const { backend, alice, bob, layout, noteId } = await setup()
    await expect(
      backend.mutation(api.gmEditor.updateLayout, change(layout))
    ).rejects.toThrow()
    await expect(
      bob.client.mutation(api.gmEditor.updateLayout, change(layout))
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.gmEditor.createProfile, {
        sourceId: layout._id,
        name: 'Vol',
      })
    ).rejects.toThrow('NOT_FOUND')
    await alice.client.mutation(api.gm.updateNote, {
      id: noteId,
      body: 'Privé',
      expectedVersion: 0,
    })
    const target = { kind: 'note' as const, id: noteId }
    const args = { target, paginationOpts: { numItems: 5, cursor: null } }
    const revision = (await alice.client.query(api.gmEditor.listHistory, args))
      .page[0]
    if (!revision) throw new Error('Missing revision')
    await expect(
      bob.client.query(api.gmEditor.listHistory, args)
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.gmEditor.restoreRevision, {
        id: revision._id,
        expectedVersion: 1,
      })
    ).rejects.toThrow('NOT_FOUND')
    await backend.mutation(components.betterAuth.adapter.deleteOne, {
      input: {
        model: 'session',
        where: [{ field: '_id', value: alice.sessionId }],
      },
    })
    await expect(
      alice.client.mutation(api.gmEditor.updateLayout, change(layout))
    ).rejects.toThrow()
  })

  it('rejects duplicate, cross-Screen and missing references plus unbounded geometry atomically', async () => {
    const { alice, layout, projectId, screenId } = await setup()
    const otherScreen = await alice.client.mutation(api.gm.createScreen, {
      projectId,
      title: 'Autre',
      format: 'digital',
    })
    const foreignId = await alice.client.mutation(api.gm.addNote, {
      screenId: otherScreen,
    })
    const base = change(layout)
    const placement = base.placements[0]
    if (!placement) throw new Error('Missing placement')
    for (const placements of [
      [],
      [placement, placement],
      [{ ...placement, noteId: foreignId }],
    ])
      await expect(
        alice.client.mutation(api.gmEditor.updateLayout, {
          ...base,
          placements,
        })
      ).rejects.toThrow('INVALID_INPUT')
    for (const patch of [
      { x: -1 },
      { x: 0.5 },
      { y: Number.POSITIVE_INFINITY },
      { width: 159 },
      { height: 119 },
      { width: 8193 },
      { layer: 100 },
    ])
      await expect(
        alice.client.mutation(api.gmEditor.updateLayout, {
          ...base,
          placements: [{ ...placement, ...patch }],
        })
      ).rejects.toThrow('INVALID_INPUT')
    for (const patch of [
      { width: 0 },
      { height: 8193 },
      { name: ' ' },
      { expectedVersion: -1 },
    ])
      await expect(
        alice.client.mutation(api.gmEditor.updateLayout, { ...base, ...patch })
      ).rejects.toThrow('INVALID_INPUT')
    expect(
      (
        await alice.client.query(api.gm.getScreen, { id: screenId })
      )?.layouts.find((p) => p._id === layout._id)
    ).toEqual(layout)
  })

  it('keeps placement when shrinking and rejects concurrent saves or stale restoration', async () => {
    const { alice, screenId, layout } = await setup()
    const version = await alice.client.mutation(api.gmEditor.updateLayout, {
      ...change(layout, 1700),
      width: 640,
      height: 480,
    })
    await expect(
      alice.client.mutation(api.gmEditor.updateLayout, change(layout, 100))
    ).rejects.toThrow('CONFLICT')
    const revision = (
      await alice.client.query(api.gmEditor.listHistory, {
        target: { kind: 'layout', id: layout._id },
        paginationOpts: { numItems: 5, cursor: null },
      })
    ).page[0]
    if (!revision) throw new Error('Missing revision')
    await expect(
      alice.client.mutation(api.gmEditor.restoreRevision, {
        id: revision._id,
        expectedVersion: layout.version,
      })
    ).rejects.toThrow('CONFLICT')
    expect(
      (
        await alice.client.query(api.gm.getScreen, { id: screenId })
      )?.layouts.find((p) => p._id === layout._id)
    ).toMatchObject({ width: 640, height: 480, placements: [{ x: 1700 }] })
    await alice.client.mutation(api.gmEditor.restoreRevision, {
      id: revision._id,
      expectedVersion: version,
    })
    const restored = (
      await alice.client.query(api.gm.getScreen, { id: screenId })
    )?.layouts.find((p) => p._id === layout._id)
    expect(restored).toMatchObject({
      width: 1920,
      height: 1080,
      version: version + 1,
      placements: [{ x: 24 }],
    })
  })

  it('persists a shared layout lock while allowing note interactions and protecting print', async () => {
    const { alice, layout, paper, screenId, noteId } = await setup()
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: true,
    })
    await expect(
      alice.client.mutation(api.gmEditor.updateLayout, change(layout))
    ).rejects.toThrow('LAYOUT_LOCKED')
    await expect(
      alice.client.mutation(api.gm.addNote, { screenId })
    ).rejects.toThrow('LAYOUT_LOCKED')
    await expect(
      alice.client.mutation(api.gmEditor.createProfile, {
        sourceId: layout._id,
        name: 'Bloqué',
      })
    ).rejects.toThrow('LAYOUT_LOCKED')
    await alice.client.mutation(api.gm.updateNote, {
      id: noteId,
      body: 'Le contenu reste interactif',
      expectedVersion: 0,
    })
    expect(
      (await alice.client.query(api.gm.getScreen, { id: screenId }))?.screen
        .layoutLocked
    ).toBe(true)
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: false,
    })
    await alice.client.mutation(api.gmEditor.updateLayout, change(layout))
    await expect(
      alice.client.mutation(api.gmEditor.updateLayout, change(paper))
    ).rejects.toThrow('INVALID_INPUT')
    expect(
      (
        await alice.client.query(api.gm.getScreen, { id: screenId })
      )?.layouts.find((p) => p._id === paper._id)
    ).toEqual(paper)
  })

  it('bounds and paginates durable history, exports it privately and restores as a new version', async () => {
    const { alice, bob, noteId, screenId } = await setup()
    for (let version = 0; version < 25; version++)
      await alice.client.mutation(api.gm.updateNote, {
        id: noteId,
        expectedVersion: version,
        body: `Texte ${version}`,
      })
    const args = {
      target: { kind: 'note' as const, id: noteId },
      paginationOpts: { numItems: 5, cursor: null },
    }
    const first = await alice.client.query(api.gmEditor.listHistory, args)
    expect(first.page).toHaveLength(5)
    expect(first.page[0]?.version).toBe(24)
    expect(first.isDone).toBe(false)
    const second = await alice.client.query(api.gmEditor.listHistory, {
      ...args,
      paginationOpts: { numItems: 5, cursor: first.continueCursor },
    })
    expect(second.page[0]?.version).toBe(19)
    const exported = await alice.client.query(api.gm.exportCollection, {
      collection: 'gmEditorHistory',
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(exported.page).toHaveLength(GM_HISTORY_LIMIT)
    expect(exported.page.every((row) => row.ownerId === alice.userId)).toBe(
      true
    )
    expect(
      (
        await bob.client.query(api.gm.exportCollection, {
          collection: 'gmEditorHistory',
          paginationOpts: { numItems: 50, cursor: null },
        })
      ).page
    ).toEqual([])
    const revision = first.page[0]
    if (!revision) throw new Error('Missing revision')
    await alice.client.mutation(api.gmEditor.restoreRevision, {
      id: revision._id,
      expectedVersion: 25,
    })
    expect(
      (await alice.client.query(api.gm.getScreen, { id: screenId }))?.notes[0]
    ).toMatchObject({ body: 'Texte 23', version: 26 })
    const count = (await alice.client.query(api.gmEditor.listHistory, args))
      .page.length
    await alice.client.mutation(api.gm.updateNote, {
      id: noteId,
      body: 'Texte 23',
      expectedVersion: 26,
    })
    expect(
      (await alice.client.query(api.gmEditor.listHistory, args)).page
    ).toHaveLength(count)
  })

  it('caps profiles and editor writes and cleans retained history when the account is removed', async () => {
    vi.useFakeTimers()
    const { backend, alice, layout, noteId } = await setup()
    for (let index = 0; index < 6; index++)
      await alice.client.mutation(api.gmEditor.createProfile, {
        sourceId: layout._id,
        name: `Profil ${index}`,
      })
    await expect(
      alice.client.mutation(api.gmEditor.createProfile, {
        sourceId: layout._id,
        name: 'Trop',
      })
    ).rejects.toThrow('LAYOUT_LIMIT')
    for (let version = 0; version < 60; version++)
      await alice.client.mutation(api.gm.updateNote, {
        id: noteId,
        expectedVersion: version,
        body: `Texte ${version}`,
      })
    await expect(
      alice.client.mutation(api.gm.updateNote, {
        id: noteId,
        expectedVersion: 60,
        body: 'Trop vite',
      })
    ).rejects.toThrow('RATE_LIMITED')
    await backend.mutation(internal.cleanup.deletedAccount, {
      userId: alice.userId,
      email: 'alice@example.test',
    })
    await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
    await backend.run(async (ctx) => {
      expect(
        await ctx.db
          .query('gmEditorHistory')
          .withIndex('by_owner', (q) => q.eq('ownerId', alice.userId))
          .collect()
      ).toEqual([])
    })
  })
})
