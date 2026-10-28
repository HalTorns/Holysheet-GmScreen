import { getDocumentSize } from 'convex/values'
import { afterEach, expect, it, vi } from 'vitest'

import { api, components, internal } from '../../convex/_generated/api'
import {
  defaultWidgetStyle,
  gmTables,
  GM_CONTENT_BYTES,
  GM_LAYOUT_BYTES,
  GM_WIDGET_BYTES,
} from '../../shared/gm'
import { readScreen } from '../helpers/gm-screen'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

afterEach(() => vi.useRealTimers())
const fullBody = '界'.repeat(50_000)
// Actual pre-F3 insert shapes: absent formatVersion, body inline, noteId geometry.
// Unlike API-created V2 notes these exercise conversion and mixed exports.
async function legacyFixture() {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'migration@example.test')
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'V1',
  })
  const screenId = await alice.client.mutation(api.gm.createScreen, {
    projectId,
    title: 'V1',
    format: 'digital',
  })
  const fixture = await backend.run(async (ctx) => {
    const common = {
      ownerId: alice.userId,
      projectId,
      screenId,
      updatedAt: 1234,
    }
    const ids = []
    for (let index = 0; index < 7; index++)
      ids.push(
        await ctx.db.insert('gmNotes', {
          ...common,
          body: index === 0 ? '' : index === 4 ? '\0'.repeat(50_000) : fullBody,
          version: 20,
          ...(index === 6 ? { deletedAt: 1200 } : {}),
        })
      )
    const profiles = await ctx.db.query('gmLayouts').collect()
    const digital = profiles.find((p) => p.kind === 'digital')
    if (!digital) throw new Error('Missing layout')
    for (let index = 0; index < 6; index++)
      profiles.push({
        ...digital,
        _id: await ctx.db.insert('gmLayouts', {
          ...common,
          name: `Profil ${index}`,
          kind: 'digital',
          unit: 'px',
          width: 1920,
          height: 1080,
          placements: [],
          version: 4,
        }),
      })
    const placements = ids.slice(0, 6).map((noteId, index) => ({
      noteId,
      x: 24 + index * 10,
      y: 24,
      width: 400,
      height: 240,
      layer: index,
      groupId: 'g',
      style: defaultWidgetStyle,
    }))
    for (const layout of profiles) {
      await ctx.db.replace('gmLayouts', layout._id, {
        ...common,
        name: layout.name,
        kind: layout.kind,
        unit: layout.unit,
        width: layout.width,
        height: layout.height,
        version: 4,
        placements,
      })
      for (let version = 0; version < 20; version++)
        await ctx.db.insert('gmEditorHistory', {
          ...common,
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
    const deleted = ids[6]
    if (!deleted) throw new Error('Missing deleted note')
    await ctx.db.patch('gmNotes', deleted, {
      trashPlacements: profiles.map((p) => ({
        layoutId: p._id,
        x: 40,
        y: 40,
        width: 400,
        height: 240,
        layer: 6,
        style: defaultWidgetStyle,
        groupId: 'g',
      })),
    })
    for (const id of ids)
      for (let version = 0; version < 20; version++)
        await ctx.db.insert('gmEditorHistory', {
          ...common,
          subjectId: id,
          version,
          snapshot: { kind: 'note', body: fullBody },
        })
    return { ids, deleted, layoutId: digital._id }
  })
  return { backend, alice, screenId, ...fixture }
}

it('runs the real ordered component runner offline, preserves V1 data and repeats without changes', async () => {
  vi.useFakeTimers()
  const { backend, alice, screenId, ids, deleted } = await legacyFixture()
  const before = await readScreen(alice.client, { id: screenId })
  expect(before?.notes).toHaveLength(6)
  expect(before?.layouts).toHaveLength(8)
  const rawBefore = await backend.run((ctx) =>
    ctx.db.query('gmNotes').collect()
  )
  const historyBefore = await backend.run((ctx) =>
    ctx.db.query('gmEditorHistory').collect()
  )
  await expect(
    alice.client.mutation(api.gm.addNote, { screenId })
  ).rejects.toThrow('MIGRATION_REQUIRED')
  const exported = await alice.client.query(api.gm.exportCollection, {
    collection: 'gmNotes',
    paginationOpts: { cursor: null, numItems: 100 },
  })
  expect(exported.page).toHaveLength(7)
  expect(exported.page[0]).toHaveProperty('body')
  await backend.mutation(internal.gmWidgetMigrations.run, {})
  await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
  const after = await readScreen(alice.client, { id: screenId })
  expect(after).toEqual(before)
  const rawAfter = await backend.run((ctx) => ctx.db.query('gmNotes').collect())
  for (const [index, note] of rawAfter.entries()) {
    expect(note).toMatchObject({
      formatVersion: 2,
      kind: 'note',
      version: 20,
      updatedAt: 1234,
      _id: rawBefore[index]?._id,
      _creationTime: rawBefore[index]?._creationTime,
    })
    expect(note).not.toHaveProperty('body')
    expect(getDocumentSize(note)).toBeLessThan(GM_WIDGET_BYTES)
  }
  const payloads = await backend.run((ctx) =>
    ctx.db.query('gmWidgetContents').collect()
  )
  expect(new Set(payloads.map((p) => p.widgetId)).size).toBe(ids.length)
  for (const payload of payloads)
    expect(getDocumentSize(payload)).toBeLessThan(GM_CONTENT_BYTES)
  const historyAfter = await backend.run((ctx) =>
    ctx.db.query('gmEditorHistory').collect()
  )
  for (const [index, revision] of historyAfter.entries()) {
    expect(revision).toMatchObject({
      _id: historyBefore[index]?._id,
      _creationTime: historyBefore[index]?._creationTime,
      updatedAt: 1234,
      formatVersion: 2,
    })
    expect(getDocumentSize(revision)).toBeLessThan(
      revision.snapshot.kind === 'note' ? GM_CONTENT_BYTES : GM_LAYOUT_BYTES
    )
  }
  await backend.mutation(internal.gmWidgetMigrations.run, {})
  await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
  expect(await backend.run((ctx) => ctx.db.query('gmNotes').collect())).toEqual(
    rawAfter
  )
  expect(
    await backend.run((ctx) => ctx.db.query('gmWidgetContents').collect())
  ).toEqual(payloads)
  expect(
    await backend.run((ctx) => ctx.db.query('gmEditorHistory').collect())
  ).toEqual(historyAfter)
  const noteId = ids[0]
  if (!noteId) throw new Error('Missing note')
  const revision = (
    await alice.client.query(api.gmEditor.listHistory, {
      target: { kind: 'note', id: noteId },
      paginationOpts: { cursor: null, numItems: 10 },
    })
  ).page[0]
  if (!revision) throw new Error('Missing revision')
  await alice.client.mutation(api.gmEditor.restoreRevision, {
    id: revision._id,
    expectedVersion: 20,
  })
  expect(
    await alice.client.query(api.gmWidgets.getNoteContent, { id: noteId })
  ).toEqual({ body: fullBody, bodyFormat: 'plain', version: 21 })
  await alice.client.mutation(api.gmWidgets.purgeNote, {
    id: deleted,
    expectedVersion: 20,
    confirmation: 'DELETE_NOTE',
  })
  expect(
    (
      await backend.run((ctx) => ctx.db.query('gmWidgetContents').collect())
    ).some((p) => p.widgetId === deleted)
  ).toBe(false)
  const statuses = await backend.query(components.migrations.lib.getStatus, {
    limit: 10,
  })
  expect(statuses).toHaveLength(3)
  expect(statuses.every((s) => s.isDone)).toBe(true)
})

it('resumes bounded batches after an intervening V1 edit and cleans mixed data without orphan payloads', async () => {
  vi.useFakeTimers()
  const { backend, alice, ids, deleted, layoutId } = await legacyFixture()
  // Explicit one-batch entry is the same mutation used by the component worker.
  const progress: unknown = await backend.mutation(
    internal.gmWidgetMigrations.notes,
    { cursor: null, oneBatchOnly: true, dryRun: false }
  )
  expect(progress).toMatchObject({ processed: 5, isDone: false })
  const edited = ids[5]
  if (!edited) throw new Error('Missing note')
  await alice.client.mutation(api.gm.updateNote, {
    id: edited,
    expectedVersion: 20,
    body: 'édition entre passes 😀',
  })
  await expect(
    alice.client.mutation(api.gmEditor.createProfile, {
      sourceId: layoutId,
      name: 'Bloqué',
    })
  ).rejects.toThrow('MIGRATION_REQUIRED')
  const mixedExport = await alice.client.query(api.gm.exportCollection, {
    collection: 'gmWidgetContents',
    paginationOpts: { cursor: null, numItems: 100 },
  })
  expect(mixedExport.page).toHaveLength(6)
  // Cleanup must already work before B completes, including inline V1 and payloads.
  await backend.mutation(internal.cleanup.deletedAccount, {
    userId: alice.userId,
    email: 'migration@example.test',
  })
  await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
  for (const table of gmTables)
    expect(await backend.run((ctx) => ctx.db.query(table).collect())).toEqual(
      []
    )
  expect(await backend.run((ctx) => ctx.db.get('gmNotes', deleted))).toBeNull()
})

it('does not overwrite a concurrent edit when a stopped pass restarts and allows structure after notes migrate', async () => {
  vi.useFakeTimers()
  const { backend, alice, screenId, ids } = await legacyFixture()
  await backend.mutation(internal.gmWidgetMigrations.run, {})
  const status = await backend.query(components.migrations.lib.getStatus, {
    limit: 10,
  })
  expect(status[0]).toMatchObject({ processed: 5, isDone: false })
  const stopped = await backend.mutation(components.migrations.lib.cancel, {
    name: 'gmWidgetMigrations:notes',
  })
  expect(stopped.state).toBe('canceled')

  const edited = ids[5]
  if (!edited) throw new Error('Missing note')
  await alice.client.mutation(api.gm.updateNote, {
    id: edited,
    expectedVersion: 20,
    body: 'édition conservée',
  })
  await backend.mutation(internal.gmWidgetMigrations.run, {})
  await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
  expect(
    await alice.client.query(api.gmWidgets.getNoteContent, { id: edited })
  ).toEqual({ body: 'édition conservée', bodyFormat: 'plain', version: 21 })
  await alice.client.mutation(api.gm.addNote, { screenId })
  expect(
    (await readScreen(alice.client, { id: screenId }))?.notes
  ).toHaveLength(7)
  const structure = await alice.client.query(api.gm.getScreen, { id: screenId })
  const layout = structure?.layouts.find(
    (profile) => profile.kind === 'digital'
  )
  if (!layout) throw new Error('Missing layout')
  const legacyPlacements = layout.placements.map(
    ({ widgetId, ...geometry }) => ({
      ...geometry,
      noteId: widgetId,
      x: geometry.x + 1,
    })
  )
  const layoutArgs = {
    id: layout._id,
    expectedVersion: layout.version,
    name: layout.name,
    width: layout.width,
    height: layout.height,
  }
  await expect(
    alice.client.mutation(api.gmEditor.updateLayout, {
      ...layoutArgs,
      placements: [
        ...legacyPlacements.slice(0, 1),
        ...layout.placements.slice(1),
      ],
    })
  ).rejects.toThrow('INVALID_INPUT')
  const first = layout.placements[0]
  if (!first) throw new Error('Missing placement')
  await expect(
    alice.client.mutation(api.gmEditor.updateLayout, {
      ...layoutArgs,
      placements: [
        { ...first, noteId: first.widgetId },
        ...layout.placements.slice(1),
      ],
    })
  ).rejects.toThrow()
  await alice.client.mutation(api.gmEditor.updateLayout, {
    ...layoutArgs,
    placements: legacyPlacements,
  })
  const storedLayout = await backend.run((ctx) =>
    ctx.db.get('gmLayouts', layout._id)
  )
  expect(storedLayout?.formatVersion).toBe(2)
  expect(
    storedLayout?.placements.every((p) => 'widgetId' in p && !('noteId' in p))
  ).toBe(true)
  // V2 export stays independently paginated by collection.
  const exported = await alice.client.query(api.gm.exportCollection, {
    collection: 'gmEditorHistory',
    paginationOpts: { cursor: null, numItems: 100 },
  })
  expect(exported.page).toHaveLength(10)
  expect(exported.isDone).toBe(false)
  await backend.mutation(internal.cleanup.deletedAccount, {
    userId: alice.userId,
    email: 'migration@example.test',
  })
  await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
  for (const table of gmTables)
    expect(await backend.run((ctx) => ctx.db.query(table).collect())).toEqual(
      []
    )
})

it('purges a migrated trash note while its history and profiles are still V1', async () => {
  vi.useFakeTimers()
  const { backend, alice, deleted, screenId } = await legacyFixture()
  await expect(
    alice.client.mutation(api.gmWidgets.purgeNote, {
      id: deleted,
      expectedVersion: 20,
      confirmation: 'DELETE_NOTE',
    })
  ).rejects.toThrow('MIGRATION_REQUIRED')
  // Run only the note pass: the account genuinely retains mixed-format tables.
  await backend.mutation(internal.gmWidgetMigrations.runner, {
    fn: 'gmWidgetMigrations:notes',
  })
  await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
  const legacyRevisions = await backend.run((ctx) =>
    ctx.db
      .query('gmEditorHistory')
      .withIndex('by_subject', (q) => q.eq('subjectId', deleted))
      .take(20)
  )
  expect(legacyRevisions).toHaveLength(20)
  expect(
    legacyRevisions.every((revision) => revision.formatVersion === undefined)
  ).toBe(true)
  const trash = await alice.client.query(api.gmWidgets.listTrash, {
    screenId,
    paginationOpts: { cursor: null, numItems: 10 },
  })
  expect(trash.page[0]?.preview).toBe(fullBody.slice(0, 240))
  await alice.client.mutation(api.gmWidgets.purgeNote, {
    id: deleted,
    expectedVersion: 20,
    confirmation: 'DELETE_NOTE',
  })
  expect(await backend.run((ctx) => ctx.db.get('gmNotes', deleted))).toBeNull()
  expect(
    await backend.run((ctx) =>
      ctx.db
        .query('gmWidgetContents')
        .withIndex('by_widget', (q) => q.eq('widgetId', deleted))
        .unique()
    )
  ).toBeNull()
  expect(
    await backend.run((ctx) =>
      ctx.db
        .query('gmEditorHistory')
        .withIndex('by_subject', (q) => q.eq('subjectId', deleted))
        .collect()
    )
  ).toEqual([])
  await backend.mutation(internal.cleanup.deletedAccount, {
    userId: alice.userId,
    email: 'migration@example.test',
  })
  await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
  for (const table of gmTables)
    expect(await backend.run((ctx) => ctx.db.query(table).collect())).toEqual(
      []
    )
})
