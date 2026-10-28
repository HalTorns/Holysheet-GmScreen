import { describe, expect, it } from 'vitest'

import { api } from '../../convex/_generated/api'
import { readScreen } from '../helpers/gm-screen'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

const page = { paginationOpts: { numItems: 50, cursor: null } }

async function setup() {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'alice@example.test')
  const bob = await createAuthenticatedUser(backend, 'bob@example.test')
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'Campagne d’Alice',
  })
  const folderId = await alice.client.mutation(api.gm.createFolder, {
    projectId,
    title: 'Session 1',
  })
  const screenId = await alice.client.mutation(api.gm.createScreen, {
    projectId,
    folderId,
    title: 'Références',
    format: 'digital',
  })
  return { backend, alice, bob, projectId, folderId, screenId }
}

// AUD-01 : chaque entrée publique GM refuse un autre compte sans révéler
// l'existence des données d'Alice ni les modifier.
describe('Refus des accès GM par un autre compte', () => {
  it('listProjects ne renvoie que les projets du compte appelant', async () => {
    const { alice, bob, projectId } = await setup()
    expect(
      (await alice.client.query(api.gm.listProjects, page)).page.map(
        (project) => project._id
      )
    ).toEqual([projectId])
    expect(await bob.client.query(api.gm.listProjects, page)).toMatchObject({
      page: [],
      isDone: true,
    })
  })

  it('listFolders et listScreens refusent le projet d’un autre compte', async () => {
    const { alice, bob, projectId, folderId } = await setup()
    expect(
      (await alice.client.query(api.gm.listFolders, { ...page, projectId }))
        .page
    ).toHaveLength(1)
    await expect(
      bob.client.query(api.gm.listFolders, { ...page, projectId })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.query(api.gm.listScreens, {
        ...page,
        projectId,
        folderId,
      })
    ).rejects.toThrow('NOT_FOUND')
  })

  it('createScreen refuse le projet ou le dossier d’un autre compte', async () => {
    const { alice, bob, projectId, folderId } = await setup()
    await expect(
      bob.client.mutation(api.gm.createScreen, {
        projectId,
        title: 'Intrus',
        format: 'digital',
      })
    ).rejects.toThrow('NOT_FOUND')
    const bobProject = await bob.client.mutation(api.gm.createProject, {
      title: 'Campagne de Bob',
    })
    await expect(
      bob.client.mutation(api.gm.createScreen, {
        projectId: bobProject,
        folderId,
        title: 'Intrus',
        format: 'digital',
      })
    ).rejects.toThrow('NOT_FOUND')
    expect(
      (
        await alice.client.query(api.gm.listScreens, {
          ...page,
          projectId,
          folderId,
        })
      ).page
    ).toHaveLength(1)
  })

  it('setLayoutLocked refuse le Screen d’un autre compte sans le modifier', async () => {
    const { alice, bob, screenId } = await setup()
    const before = await readScreen(alice.client, { id: screenId })
    await expect(
      bob.client.mutation(api.gmEditor.setLayoutLocked, {
        screenId,
        locked: true,
      })
    ).rejects.toThrow('NOT_FOUND')
    const after = await readScreen(alice.client, { id: screenId })
    expect(after?.screen).toEqual(before?.screen)
  })
})

it('refuses anonymous and foreign paginated metadata and single payload access', async () => {
  const { backend, alice, bob, screenId } = await setup()
  const id = await alice.client.mutation(api.gm.addNote, { screenId })
  for (const client of [backend, bob.client]) {
    await expect(
      client.query(api.gmWidgets.listScreenWidgets, { ...page, screenId })
    ).rejects.toThrow()
    await expect(
      client.query(api.gmWidgets.getNoteContent, { id })
    ).rejects.toThrow()
    await expect(
      client.mutation(api.gmWidgets.addWidget, { screenId, kind: 'note' })
    ).rejects.toThrow()
    await expect(
      client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 0,
        widget: { kind: 'note', config: {}, state: {}, body: 'Intrus' },
      })
    ).rejects.toThrow()
  }
  expect(
    await alice.client.query(api.gmWidgets.getNoteContent, { id })
  ).toEqual({ body: '', bodyFormat: 'plain', version: 0 })
})
