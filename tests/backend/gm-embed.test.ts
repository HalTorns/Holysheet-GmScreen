import { afterEach, expect, test, vi } from 'vitest'

import { api, components } from '../../convex/_generated/api'
import { initialWidget } from '../../shared/gm'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

afterEach(() => vi.unstubAllEnvs())
async function setup() {
  vi.stubEnv('SITE_URL', 'https://app.example.com')
  vi.stubEnv('CONVEX_CLOUD_URL', 'https://cloud.example.com')
  vi.stubEnv('CONVEX_SITE_URL', 'https://site.example.com')
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'embed@example.test')
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'Embed',
  })
  const screenId = await alice.client.mutation(api.gm.createScreen, {
    projectId,
    title: 'Embed',
    format: 'digital',
  })
  const id = await alice.client.mutation(api.gmWidgets.addWidget, {
    screenId,
    kind: 'embed',
  })
  const read = async () => {
    const widgets = await alice.client.query(
      api.gmWidgets.getScreenWidgetMetadata,
      { screenId }
    )
    const widget = widgets.find((value) => value._id === id)
    if (!widget || widget.kind !== 'embed') throw new Error('Missing embed')
    return widget
  }
  const layout = async () => {
    const screen = await alice.client.query(api.gm.getScreen, { id: screenId })
    const value = screen?.layouts.find((entry) => entry.kind === 'digital')
    if (!value) throw new Error('Missing layout')
    return value
  }
  return { backend, alice, screenId, id, read, layout }
}
const configured = {
  ...initialWidget('embed'),
  config: {
    title: 'Public',
    url: 'https://EXAMPLE.com.:443/a b',
    mode: 'frame' as const,
  },
}
// Public entry points own these regressions: schema-only tests cannot prove
// copying or restoring previously valid data re-applies the current URL policy.
test('empty creation, canonical save, duplicate, revisions, trash and lossless export', async () => {
  const { alice, id, read, layout } = await setup()
  expect(await read()).toMatchObject(initialWidget('embed'))
  await alice.client.mutation(api.gmWidgets.updateWidget, {
    id,
    expectedVersion: 0,
    widget: configured,
  })
  expect((await read()).config.url).toBe('https://example.com/a%20b')
  const profile = await layout()
  const copies = await alice.client.mutation(api.gmWidgets.changeNotes, {
    layoutId: profile._id,
    expectedVersion: profile.version,
    notes: [{ id, version: 1 }],
    operation: 'duplicate',
  })
  expect(copies).toHaveLength(1)
  const exported = await alice.client.query(api.gm.exportCollection, {
    collection: 'gmNotes',
    paginationOpts: { cursor: null, numItems: 10 },
  })
  expect(exported.page.find((entry) => entry._id === copies[0])).toMatchObject({
    kind: 'embed',
    config: { url: 'https://example.com/a%20b' },
  })
  await alice.client.mutation(api.gmWidgets.updateWidget, {
    id,
    expectedVersion: 1,
    widget: {
      ...configured,
      config: { ...configured.config, title: 'Changed' },
    },
  })
  const history = await alice.client.query(api.gmEditor.listHistory, {
    target: { kind: 'note', id },
    paginationOpts: { cursor: null, numItems: 20 },
  })
  const revision = history.page.find((entry) => entry.version === 1)
  if (!revision) throw new Error('Missing revision')
  await alice.client.mutation(api.gmEditor.restoreRevision, {
    id: revision._id,
    expectedVersion: 2,
  })
  expect((await read()).config.title).toBe('Public')
  const updated = await layout()
  await alice.client.mutation(api.gmWidgets.changeNotes, {
    layoutId: updated._id,
    expectedVersion: updated.version,
    notes: [{ id, version: 3 }],
    operation: 'trash',
  })
  await alice.client.mutation(api.gmWidgets.restoreNote, {
    id,
    expectedVersion: 4,
  })
  expect(await read()).toMatchObject({
    kind: 'embed',
    version: 5,
    config: { title: 'Public', url: 'https://example.com/a%20b' },
  })
  expect(
    (await layout()).placements.some((entry) => entry.widgetId === id)
  ).toBe(true)
  await expect(
    alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 1,
      widget: configured,
    })
  ).rejects.toThrow('CONFLICT')
})
test('INVALID_URL on all five writes, including URLs newly forbidden by an app origin', async () => {
  const { backend, alice, screenId, id, read, layout } = await setup()
  const invalid = { ...configured.config, url: 'https://127.1' }
  await expect(
    alice.client.mutation(api.gmWidgets.addWidget, {
      screenId,
      kind: 'embed',
      embedConfig: invalid,
    })
  ).rejects.toThrow('INVALID_URL')
  await expect(
    alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 0,
      widget: { ...configured, config: invalid },
    })
  ).rejects.toThrow('INVALID_URL')
  await alice.client.mutation(api.gmWidgets.updateWidget, {
    id,
    expectedVersion: 0,
    widget: configured,
  })
  await alice.client.mutation(api.gmWidgets.updateWidget, {
    id,
    expectedVersion: 1,
    widget: {
      ...configured,
      config: { ...configured.config, url: 'https://other.example.com' },
    },
  })
  const history = await alice.client.query(api.gmEditor.listHistory, {
    target: { kind: 'note', id },
    paginationOpts: { cursor: null, numItems: 20 },
  })
  const revision = history.page.find((entry) => entry.version === 1)
  if (!revision) throw new Error('Missing revision')
  vi.stubEnv('CONVEX_CLOUD_URL', 'https://example.com')
  await expect(
    alice.client.mutation(api.gmEditor.restoreRevision, {
      id: revision._id,
      expectedVersion: 2,
    })
  ).rejects.toThrow('INVALID_URL')
  // Historical storage may predate the policy. Reads and exports preserve it.
  await backend.run(async (ctx) => {
    await ctx.db.patch('gmNotes', id, {
      config: { ...configured.config, url: 'https://example.com/a%20b' },
    })
  })
  expect((await read()).config.url).toBe('https://example.com/a%20b')
  const exported = await alice.client.query(api.gm.exportCollection, {
    collection: 'gmNotes',
    paginationOpts: { cursor: null, numItems: 10 },
  })
  expect(exported.page.find((entry) => entry._id === id)).toMatchObject({
    config: { url: 'https://example.com/a%20b' },
  })
  const profile = await layout()
  await expect(
    alice.client.mutation(api.gmWidgets.changeNotes, {
      layoutId: profile._id,
      expectedVersion: profile.version,
      notes: [{ id, version: 2 }],
      operation: 'duplicate',
    })
  ).rejects.toThrow('INVALID_URL')
  await alice.client.mutation(api.gmWidgets.changeNotes, {
    layoutId: profile._id,
    expectedVersion: profile.version,
    notes: [{ id, version: 2 }],
    operation: 'trash',
  })
  await expect(
    alice.client.mutation(api.gmWidgets.restoreNote, { id, expectedVersion: 3 })
  ).rejects.toThrow('INVALID_URL')
})
test('component reset clears all editor shards using the operator name/key contract', async () => {
  const { backend, alice, id } = await setup()
  for (let version = 0; version < 12; version++) {
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: version,
      widget: {
        ...configured,
        config: { ...configured.config, title: `Edit ${version}` },
      },
    })
  }
  await backend.mutation(components.rateLimiter.lib.resetRateLimit, {
    name: 'gmEditorWrite',
    key: alice.userId,
  })
  const random = vi.spyOn(Math, 'random')
  for (const fraction of [0.1, 0.3, 0.6, 0.9]) {
    random.mockReturnValue(fraction)
    const result = await backend.query(components.rateLimiter.lib.getValue, {
      name: 'gmEditorWrite',
      key: alice.userId,
      config: {
        kind: 'token bucket',
        rate: 120,
        period: 60_000,
        capacity: 60,
        shards: 4,
      },
      sampleShards: 1,
    })
    // A missing shard has ts=0; inspect each, rather than only the fullest.
    expect(result).toMatchObject({
      value: 60,
      ts: 0,
      config: { rate: 120, capacity: 60, shards: 4 },
    })
  }
})
