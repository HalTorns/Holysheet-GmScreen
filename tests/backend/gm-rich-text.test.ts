import { makeFunctionReference } from 'convex/server'
import { expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

async function setup() {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'rich@example.test')
  const bob = await createAuthenticatedUser(backend, 'other-rich@example.test')
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'Riche',
  })
  const screenId = await alice.client.mutation(api.gm.createScreen, {
    projectId,
    title: 'Notes',
    format: 'digital',
  })
  const id = await alice.client.mutation(api.gm.addNote, { screenId })
  return { backend, alice, bob, id, screenId, projectId }
}

it('versions the complete body/format pair through both public writers and restores plain and rich revisions', async () => {
  const { alice, id } = await setup()
  expect(
    await alice.client.query(api.gmWidgets.getNoteContent, { id })
  ).toEqual({ body: '', bodyFormat: 'plain', version: 0 })
  expect(
    await alice.client.mutation(api.gm.updateNote, {
      id,
      body: '',
      bodyFormat: 'markdown-v1',
      expectedVersion: 0,
    })
  ).toBe(1)
  expect(
    await alice.client.mutation(api.gm.updateNote, {
      id,
      body: '',
      expectedVersion: 1,
    })
  ).toBe(1)
  await alice.client.mutation(api.gmWidgets.updateWidget, {
    id,
    expectedVersion: 1,
    widget: { kind: 'note', config: {}, state: {}, body: '**riche**' },
  })
  expect(
    await alice.client.query(api.gmWidgets.getNoteContent, { id })
  ).toEqual({ body: '**riche**', bodyFormat: 'markdown-v1', version: 2 })
  const history = await alice.client.query(api.gmEditor.listHistory, {
    target: { kind: 'note', id },
    paginationOpts: { numItems: 5, cursor: null },
  })
  const plain = history.page.find((revision) => revision.version === 0)
  const rich = history.page.find((revision) => revision.version === 1)
  if (!plain || !rich) throw new Error('Missing revisions')
  expect(plain.snapshot).toMatchObject({ bodyFormat: 'plain', body: '' })
  expect(rich.snapshot).toMatchObject({ bodyFormat: 'markdown-v1', body: '' })
  await alice.client.mutation(api.gmEditor.restoreRevision, {
    id: plain._id,
    expectedVersion: 2,
  })
  expect(
    await alice.client.query(api.gmWidgets.getNoteContent, { id })
  ).toMatchObject({ bodyFormat: 'plain', version: 3 })
  await alice.client.mutation(api.gmEditor.restoreRevision, {
    id: rich._id,
    expectedVersion: 3,
  })
  expect(
    await alice.client.query(api.gmWidgets.getNoteContent, { id })
  ).toMatchObject({ bodyFormat: 'markdown-v1', version: 4 })
})

it('normalizes V1 and absent V2 formats and restores old snapshots without inheriting rich format', async () => {
  const { backend, alice, id } = await setup()
  await backend.run(async (ctx) => {
    const note = await ctx.db.get('gmNotes', id)
    if (!note) throw new Error('Missing note')
    const { formatVersion: _format, ...common } = note
    if (!('kind' in common)) throw new Error('Missing V2')
    const { kind: _kind, config: _config, state: _state, ...legacy } = common
    await ctx.db.replace('gmNotes', id, { ...legacy, body: '# **littéral**' })
    const content = await ctx.db
      .query('gmWidgetContents')
      .withIndex('by_widget', (q) => q.eq('widgetId', id))
      .unique()
    if (content) await ctx.db.delete('gmWidgetContents', content._id)
    await ctx.db.insert('gmEditorHistory', {
      ownerId: note.ownerId,
      projectId: note.projectId,
      screenId: note.screenId,
      subjectId: id,
      version: 0,
      updatedAt: 1,
      snapshot: { kind: 'note', body: '# ancien' },
    })
  })
  expect(
    await alice.client.query(api.gmWidgets.getNoteContent, { id })
  ).toMatchObject({ body: '# **littéral**', bodyFormat: 'plain' })
  await alice.client.mutation(api.gm.updateNote, {
    id,
    expectedVersion: 0,
    body: '**riche**',
    bodyFormat: 'markdown-v1',
  })
  const history = await alice.client.query(api.gmEditor.listHistory, {
    target: { kind: 'note', id },
    paginationOpts: { numItems: 5, cursor: null },
  })
  const old = history.page.find(
    (revision) =>
      revision.snapshot.kind === 'note' && revision.snapshot.body === '# ancien'
  )
  if (!old) throw new Error('Missing legacy revision')
  await alice.client.mutation(api.gmEditor.restoreRevision, {
    id: old._id,
    expectedVersion: 1,
  })
  expect(
    await alice.client.query(api.gmWidgets.getNoteContent, { id })
  ).toMatchObject({ body: '# ancien', bodyFormat: 'plain' })
})

it('enforces ownership, kind, optimistic version and UTF-16/content budgets on both write routes', async () => {
  const { alice, bob, id, screenId } = await setup()
  const counter = await alice.client.mutation(api.gmWidgets.addWidget, {
    screenId,
    kind: 'counter',
  })
  const writers = [
    (
      client: typeof alice.client,
      target: typeof id,
      body: string,
      expectedVersion: number
    ) =>
      client.mutation(api.gm.updateNote, {
        id: target,
        body,
        bodyFormat: 'markdown-v1',
        expectedVersion,
      }),
    (
      client: typeof alice.client,
      target: typeof id,
      body: string,
      expectedVersion: number
    ) =>
      client.mutation(api.gmWidgets.updateWidget, {
        id: target,
        expectedVersion,
        widget: {
          kind: 'note',
          config: {},
          state: {},
          body,
          bodyFormat: 'markdown-v1',
        },
      }),
  ]
  let version = 0
  for (const write of writers) {
    await expect(write(bob.client, id, 'vol', version)).rejects.toThrow(
      'NOT_FOUND'
    )
    await expect(
      write(alice.client, counter, 'autre kind', 0)
    ).rejects.toThrow()
    await expect(
      write(alice.client, id, 'trop long'.repeat(6251), version)
    ).rejects.toThrow('INVALID_INPUT')
    await expect(write(alice.client, id, 'x', version + 1)).rejects.toThrow(
      'CONFLICT'
    )
    version = await write(alice.client, id, 'é'.repeat(50_000), version)
    expect(
      await alice.client.query(api.gmWidgets.getNoteContent, { id })
    ).toMatchObject({ bodyFormat: 'markdown-v1', body: 'é'.repeat(50_000) })
    await expect(
      write(alice.client, id, 'x'.repeat(50_001), version)
    ).rejects.toThrow('INVALID_INPUT')
  }
})

it('preserves rich content through duplicate/copy, trash, export and purge without orphan payloads', async () => {
  const { backend, alice, id, screenId } = await setup()
  await alice.client.mutation(api.gm.updateNote, {
    id,
    expectedVersion: 0,
    body: ':::details[Secret]\n**riche**\n:::',
    bodyFormat: 'markdown-v1',
  })
  const screen = await alice.client.query(api.gm.getScreen, { id: screenId })
  const layout = screen?.layouts.find((item) => item.kind === 'digital')
  if (!layout) throw new Error('Missing layout')
  const [copy] = await alice.client.mutation(api.gmWidgets.changeNotes, {
    layoutId: layout._id,
    expectedVersion: layout.version,
    notes: [{ id, version: 1 }],
    operation: 'duplicate',
  })
  if (!copy) throw new Error('Missing copy')
  expect(
    await alice.client.query(api.gmWidgets.getNoteContent, { id: copy })
  ).toMatchObject({
    bodyFormat: 'markdown-v1',
    body: ':::details[Secret]\n**riche**\n:::',
  })
  const current = await alice.client.query(api.gm.getScreen, { id: screenId })
  const active = current?.layouts.find((item) => item._id === layout._id)
  if (!active) throw new Error('Missing layout')
  await alice.client.mutation(api.gmWidgets.changeNotes, {
    layoutId: active._id,
    expectedVersion: active.version,
    notes: [{ id: copy, version: 0 }],
    operation: 'trash',
  })
  await alice.client.mutation(api.gmWidgets.restoreNote, {
    id: copy,
    expectedVersion: 1,
  })
  expect(
    await alice.client.query(api.gmWidgets.getNoteContent, { id: copy })
  ).toMatchObject({ bodyFormat: 'markdown-v1' })
  const exported = await alice.client.query(api.gm.exportCollection, {
    collection: 'gmWidgetContents',
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(exported.page).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ widgetId: copy, bodyFormat: 'markdown-v1' }),
    ])
  )
  const latest = await alice.client.query(api.gm.getScreen, { id: screenId })
  const profile = latest?.layouts.find((item) => item._id === layout._id)
  if (!profile) throw new Error('Missing layout')
  await alice.client.mutation(api.gmWidgets.changeNotes, {
    layoutId: profile._id,
    expectedVersion: profile.version,
    notes: [{ id: copy, version: 2 }],
    operation: 'trash',
  })
  await alice.client.mutation(api.gmWidgets.purgeNote, {
    id: copy,
    expectedVersion: 3,
    confirmation: 'DELETE_NOTE',
  })
  expect(
    await backend.run((ctx) =>
      ctx.db
        .query('gmWidgetContents')
        .withIndex('by_widget', (q) => q.eq('widgetId', copy))
        .collect()
    )
  ).toEqual([])
})

it('rejects an explicitly invalid format at each real public writer', async () => {
  const { alice, id } = await setup()
  const invalid = { id, body: 'body', bodyFormat: 'html', expectedVersion: 0 }
  const update = makeFunctionReference<'mutation'>('gm:updateNote')
  const updateWidget = makeFunctionReference<'mutation'>(
    'gmWidgets:updateWidget'
  )
  await expect(alice.client.mutation(update, invalid)).rejects.toThrow()
  await expect(
    alice.client.mutation(updateWidget, {
      id,
      expectedVersion: 0,
      widget: {
        kind: 'note',
        config: {},
        state: {},
        body: 'body',
        bodyFormat: 'html',
      },
    })
  ).rejects.toThrow()
  expect(
    await alice.client.query(api.gmWidgets.getNoteContent, { id })
  ).toMatchObject({ version: 0, bodyFormat: 'plain' })
})
