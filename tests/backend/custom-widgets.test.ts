import { afterEach, expect, test, vi } from 'vitest'

import { api } from '../../convex/_generated/api'
import {
  confirmOperation,
  createAuthenticatedUser,
  createBackendTest,
} from './fixtures'

const definition = {
  name: 'Compteur',
  html: '<button>+</button>',
  css: '',
  source: 'widget.setState({count:1})',
  compiled: 'widget.setState({count:1})',
  language: 'js' as const,
}
afterEach(() => vi.useRealTimers())
async function setup() {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'f8-alice@example.test')
  const bob = await createAuthenticatedUser(backend, 'f8-bob@example.test')
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'F8',
  })
  const screenId = await alice.client.mutation(api.gm.createScreen, {
    projectId,
    title: 'Écran',
    format: 'digital',
  })
  const id = await alice.client.mutation(api.customWidgets.save, {
    ...definition,
    projectId,
    expectedVersion: 0,
  })
  const widgetId = await alice.client.mutation(api.customWidgets.place, {
    screenId,
    definitionId: id,
  })
  return { backend, alice, bob, projectId, screenId, id, widgetId }
}
test('F8 enforces ownership, project references, versions, trash visibility and purge usage atomically', async () => {
  const { alice, bob, projectId, screenId, id, widgetId, backend } =
    await setup()
  await expect(
    bob.client.query(api.customWidgets.getForWidget, { widgetId })
  ).rejects.toThrow('NOT_FOUND')
  await expect(
    bob.client.mutation(api.customWidgets.save, {
      ...definition,
      projectId,
      id,
      expectedVersion: 0,
    })
  ).rejects.toThrow('NOT_FOUND')
  const otherProject = await alice.client.mutation(api.gm.createProject, {
    title: 'Autre',
  })
  const otherScreen = await alice.client.mutation(api.gm.createScreen, {
    projectId: otherProject,
    title: 'Autre',
    format: 'digital',
  })
  await expect(
    alice.client.mutation(api.customWidgets.place, {
      screenId: otherScreen,
      definitionId: id,
    })
  ).rejects.toThrow('NOT_FOUND')
  await expect(
    alice.client.mutation(api.gmWidgets.updateWidget, {
      id: widgetId,
      expectedVersion: 0,
      widget: {
        kind: 'custom',
        config: { definitionId: id, settings: { bad: { nested: 1 } } },
        state: {},
      },
    })
  ).rejects.toThrow('INVALID_INPUT')
  await alice.client.mutation(api.customWidgets.saveState, {
    id: widgetId,
    expectedVersion: 0,
    state: { count: 4 },
  })
  await expect(
    alice.client.mutation(api.customWidgets.saveState, {
      id: widgetId,
      expectedVersion: 0,
      state: {},
    })
  ).rejects.toThrow('CONFLICT')
  expect(
    await backend.run((ctx) => ctx.db.query('gmEditorHistory').collect())
  ).toEqual([])
  await alice.client.mutation(api.customWidgets.setTrashed, {
    id,
    expectedVersion: 0,
    trashed: true,
  })
  expect(
    await alice.client.query(api.customWidgets.getForWidget, { widgetId })
  ).toBeNull()
  await expect(
    alice.client.mutation(api.customWidgets.place, {
      screenId,
      definitionId: id,
    })
  ).rejects.toThrow('NOT_FOUND')
  await expect(
    alice.client.mutation(api.customWidgets.purge, { id, expectedVersion: 1 })
  ).rejects.toThrow('IN_USE')
  await alice.client.mutation(api.customWidgets.setTrashed, {
    id,
    expectedVersion: 1,
    trashed: false,
  })
  expect(
    await alice.client.query(api.customWidgets.getForWidget, { widgetId })
  ).toMatchObject({ name: 'Compteur', version: 2 })
  await alice.client.mutation(api.customWidgets.setTrashed, {
    id,
    expectedVersion: 2,
    trashed: true,
  })
  await backend.run((ctx) =>
    ctx.db.patch('gmNotes', widgetId, { deletedAt: Date.now() })
  )
  await alice.client.mutation(api.customWidgets.purge, {
    id,
    expectedVersion: 3,
  })
  expect(
    await backend.run((ctx) => ctx.db.get('gmCustomWidgets', id))
  ).toBeNull()
})
test('F8 bounds UTF-8 definition sizes, flat settings, state size/depth and project capacity', async () => {
  const { alice, backend, projectId, widgetId, id } = await setup()
  for (const patch of [
    { html: 'é'.repeat(32_769) },
    { compiled: 'x'.repeat(65_537) },
    { css: 'x'.repeat(65_537) },
  ])
    await expect(
      alice.client.mutation(api.customWidgets.save, {
        ...definition,
        ...patch,
        projectId,
        expectedVersion: 0,
      })
    ).rejects.toThrow('INVALID_INPUT')
  for (const state of [
    { text: 'x'.repeat(8193) },
    { a: { a: { a: { a: { a: { a: { a: { a: { a: 1 } } } } } } } } },
  ])
    await expect(
      alice.client.mutation(api.customWidgets.saveState, {
        id: widgetId,
        expectedVersion: 0,
        state,
      })
    ).rejects.toThrow('INVALID_INPUT')
  await backend.run(async (ctx) => {
    for (let index = 0; index < 99; index++)
      await ctx.db.insert('gmCustomWidgets', {
        ...definition,
        projectId,
        ownerId: alice.userId,
        version: 0,
      })
  })
  await expect(
    alice.client.mutation(api.customWidgets.save, {
      ...definition,
      projectId,
      expectedVersion: 0,
    })
  ).rejects.toThrow('PROJECT_LIMIT')
  expect(id).toBeTruthy()
})
test('F8 state quota is independent of normal note writes, export and cleanup retain their lifecycle contract', async () => {
  vi.useFakeTimers()
  const { alice, backend, projectId, screenId, widgetId, id } = await setup()
  vi.spyOn(Math, 'random').mockReturnValue(0)
  let version = 0
  let limited = false
  for (let index = 0; index < 31; index++) {
    try {
      version = await alice.client.mutation(api.customWidgets.saveState, {
        id: widgetId,
        expectedVersion: version,
        state: { index },
      })
    } catch {
      limited = true
      break
    }
  }
  expect(limited).toBe(true)
  const note = await alice.client.mutation(api.gm.addNote, { screenId })
  await alice.client.mutation(api.gm.updateNote, {
    id: note,
    expectedVersion: 0,
    body: 'Toujours modifiable',
  })
  const exported = await alice.client.query(api.gm.exportCollection, {
    collection: 'gmCustomWidgets',
    paginationOpts: { numItems: 10, cursor: null },
  })
  expect(exported.page).toEqual([
    expect.objectContaining({ _id: id, projectId }),
  ])
  await confirmOperation(backend, alice, 'account.delete')
  await alice.client.mutation(api.account.deleteAccount, {
    confirmation: 'DELETE',
  })
  await backend.finishAllScheduledFunctions(vi.runAllTimers)
  expect(
    await backend.run((ctx) => ctx.db.query('gmCustomWidgets').collect())
  ).toEqual([])
})
