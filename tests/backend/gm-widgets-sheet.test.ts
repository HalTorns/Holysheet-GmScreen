import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import { readScreen } from '../helpers/gm-screen'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

async function setup() {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(
    backend,
    'sheet-widget@example.test'
  )
  const bob = await createAuthenticatedUser(
    backend,
    'sheet-widget-other@example.test'
  )
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'Projet',
  })
  const screenId = await alice.client.mutation(api.gm.createScreen, {
    projectId,
    title: 'Écran',
    format: 'digital',
  })
  const sheetId = await alice.client.mutation(api.gmSheets.createSheet, {
    projectId,
    title: 'Aubergiste',
    kind: 'npc',
  })
  const content = {
    kind: 'npc' as const,
    title: 'Aubergiste',
    summary: 'Résumé vivant',
    body: 'Corps vivant',
    fields: [
      { label: 'Ville', value: 'Port-Sel' },
      { label: 'Secret', value: 'Invisible' },
    ],
  }
  await alice.client.mutation(api.gmSheets.updateSheet, {
    id: sheetId,
    expectedVersion: 0,
    ...content,
  })
  const id = await alice.client.mutation(api.gmWidgets.addWidget, {
    screenId,
    kind: 'sheet',
  })
  const config = {
    title: '',
    sheetId,
    display: 'summary' as const,
    fieldLabels: [] as string[],
  }
  return {
    backend,
    alice,
    bob,
    projectId,
    screenId,
    sheetId,
    id,
    config,
    content,
  }
}

// Public widget entry points own reference integrity and projection. Existing F3
// lifecycle tests do not resolve library content or cover cross-project links.
describe('Library sheet widgets', () => {
  it('links a single source, projects each display mode and preserves references in copies/history', async () => {
    const { alice, screenId, sheetId, id, config, content } = await setup()
    const preview = () =>
      alice.client.query(api.gmWidgets.getSheetPreview, { widgetId: id })
    expect(await preview()).toEqual({ status: 'missing' })
    for (const [index, display] of (
      ['summary', 'fields', 'full'] as const
    ).entries()) {
      await alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: index,
        widget: {
          kind: 'sheet',
          config: { ...config, display, fieldLabels: ['Ville'] },
          state: {},
        },
      })
      const result = await preview()
      expect(result).toEqual({
        status: 'ok',
        sheet: {
          _id: sheetId,
          kind: 'npc',
          title: 'Aubergiste',
          summary: content.summary,
        },
        ...(display === 'summary' ? {} : { fields: [content.fields[0]] }),
        ...(display === 'full' ? { body: content.body } : {}),
      })
      expect(JSON.stringify(result)).not.toContain('Invisible')
    }
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 3,
      widget: {
        kind: 'sheet',
        config: { ...config, display: 'fields' },
        state: {},
      },
    })
    expect(await preview()).toMatchObject({ fields: content.fields })
    const screen = await readScreen(alice.client, { id: screenId })
    const layout = screen?.layouts.find((entry) => entry.kind === 'digital')
    if (!layout) throw new Error('Missing layout')
    const [copy] = await alice.client.mutation(api.gmWidgets.changeNotes, {
      layoutId: layout._id,
      expectedVersion: layout.version,
      notes: [{ id, version: 4 }],
      operation: 'duplicate',
    })
    if (!copy) throw new Error('Missing copy')
    await alice.client.mutation(api.gmSheets.updateSheet, {
      id: sheetId,
      expectedVersion: 1,
      ...content,
      summary: 'Modifié à la source',
    })
    for (const widgetId of [id, copy])
      expect(
        await alice.client.query(api.gmWidgets.getSheetPreview, { widgetId })
      ).toMatchObject({ sheet: { summary: 'Modifié à la source' } })
    const saved = await alice.client.query(api.gmWidgets.listScreenWidgets, {
      screenId,
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(saved.page.find((entry) => entry._id === copy)).toMatchObject({
      config: { sheetId },
    })
    expect(JSON.stringify(saved.page)).not.toContain('Modifié à la source')
    const history = await alice.client.query(api.gmEditor.listHistory, {
      target: { kind: 'note', id },
      paginationOpts: { numItems: 10, cursor: null },
    })
    const revision = history.page.find(
      (entry) =>
        entry.snapshot.kind === 'sheet' &&
        entry.snapshot.config.sheetId === sheetId &&
        entry.snapshot.config.display === 'summary'
    )
    if (!revision) throw new Error('Missing sheet configuration revision')
    expect(JSON.stringify(history.page)).not.toContain(content.body)
    await alice.client.mutation(api.gmEditor.restoreRevision, {
      id: revision._id,
      expectedVersion: 4,
    })
    expect(await preview()).toEqual({
      status: 'ok',
      sheet: {
        _id: sheetId,
        kind: 'npc',
        title: 'Aubergiste',
        summary: 'Modifié à la source',
      },
    })
    await alice.client.mutation(api.gmSheets.trashSheet, { id: sheetId })
    expect(await preview()).toEqual({ status: 'missing' })
    await alice.client.mutation(api.gmSheets.deleteSheetForever, {
      id: sheetId,
    })
    expect(await preview()).toEqual({ status: 'missing' })
    expect(
      (
        await alice.client.query(api.gmWidgets.listScreenWidgets, {
          screenId,
          paginationOpts: { numItems: 10, cursor: null },
        })
      ).page
    ).toHaveLength(2)
  })

  it('refuses foreign, cross-project and trashed references on creation and update', async () => {
    const { alice, bob, screenId, sheetId, id, config } = await setup()
    const otherProject = await alice.client.mutation(api.gm.createProject, {
      title: 'Autre',
    })
    const foreignProject = await bob.client.mutation(api.gm.createProject, {
      title: 'Tiers',
    })
    const otherSheet = await alice.client.mutation(api.gmSheets.createSheet, {
      projectId: otherProject,
      title: 'Autre',
      kind: 'npc',
    })
    const foreignSheet = await bob.client.mutation(api.gmSheets.createSheet, {
      projectId: foreignProject,
      title: 'Tiers',
      kind: 'npc',
    })
    await alice.client.mutation(api.gmSheets.trashSheet, { id: sheetId })
    for (const reference of [otherSheet, foreignSheet, sheetId]) {
      await expect(
        alice.client.mutation(api.gmWidgets.addWidget, {
          screenId,
          kind: 'sheet',
          sheetId: reference,
        })
      ).rejects.toThrow('NOT_FOUND')
      await expect(
        alice.client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 0,
          widget: {
            kind: 'sheet',
            config: { ...config, sheetId: reference },
            state: {},
          },
        })
      ).rejects.toThrow('NOT_FOUND')
    }
    await alice.client.mutation(api.gmSheets.restoreSheet, { id: sheetId })
    const linked = await alice.client.mutation(api.gmWidgets.addWidget, {
      screenId,
      kind: 'sheet',
      sheetId,
    })
    expect(
      await alice.client.query(api.gmWidgets.getSheetPreview, {
        widgetId: linked,
      })
    ).toMatchObject({ status: 'ok' })
  })

  it('validates strict configuration, versions, immutable kinds and locking; refuses other accounts', async () => {
    const { alice, bob, screenId, sheetId, id, config } = await setup()
    for (const fieldLabels of [
      [''],
      ['x'.repeat(61)],
      ['Ville', 'Ville'],
      Array.from({ length: 41 }, (_, index) => String(index)),
    ]) {
      await expect(
        alice.client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 0,
          widget: {
            kind: 'sheet',
            config: { ...config, fieldLabels },
            state: {},
          },
        })
      ).rejects.toThrow('INVALID_INPUT')
    }
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 0,
        widget: {
          kind: 'sheet',
          config: { ...config, title: 'x'.repeat(121) },
          state: {},
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
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 0,
      widget: { kind: 'sheet', config, state: {} },
    })
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 0,
        widget: { kind: 'sheet', config, state: {} },
      })
    ).rejects.toThrow('CONFLICT')
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: true,
    })
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 1,
        widget: {
          kind: 'sheet',
          config: { ...config, display: 'full' },
          state: {},
        },
      })
    ).rejects.toThrow('LAYOUT_LOCKED')
    await expect(
      bob.client.query(api.gmWidgets.getSheetPreview, { widgetId: id })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.gmWidgets.addWidget, {
        screenId,
        kind: 'sheet',
        sheetId,
      })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 1,
        widget: { kind: 'sheet', config, state: {} },
      })
    ).rejects.toThrow('NOT_FOUND')
  })
})
