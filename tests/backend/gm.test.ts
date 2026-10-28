import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, components, internal } from '../../convex/_generated/api'
import { gmTables } from '../../shared/gm'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

afterEach(() => vi.useRealTimers())

describe('Holysheet personal workspace', () => {
  it('persists a project, nested folders, Screen and versioned note while isolating another account', async () => {
    const backend = createBackendTest()
    const alice = await createAuthenticatedUser(backend, 'alice@example.test')
    const bob = await createAuthenticatedUser(backend, 'bob@example.test')
    const projectId = await alice.client.mutation(api.gm.createProject, {
      title: ' Campagne ',
    })
    const folderId = await alice.client.mutation(api.gm.createFolder, {
      projectId,
      title: 'Session 1',
    })
    const child = await alice.client.mutation(api.gm.createFolder, {
      projectId,
      parentId: folderId,
      title: 'Lieux',
    })
    const screenId = await alice.client.mutation(api.gm.createScreen, {
      projectId,
      folderId: child,
      title: 'Références',
      format: 'a4-landscape',
    })
    const noteId = await alice.client.mutation(api.gm.addNote, { screenId })
    await alice.client.mutation(api.gm.updateNote, {
      id: noteId,
      expectedVersion: 0,
      body: 'Le marchand ferme au crépuscule.',
    })
    const saved = await alice.client.query(api.gm.getScreen, { id: screenId })
    expect(saved?.notes[0]).toMatchObject({
      body: 'Le marchand ferme au crépuscule.',
      version: 1,
    })
    expect(
      saved?.layouts.find((layout) => layout.kind === 'print')
    ).toMatchObject({ unit: 'mm', width: 297, height: 210 })
    expect(
      saved?.layouts.every((layout) => layout.placements[0]?.noteId === noteId)
    ).toBe(true)
    expect(
      await bob.client.query(api.gm.getScreen, { id: screenId })
    ).toBeNull()
    expect(
      await bob.client.query(api.gm.getProject, { id: projectId })
    ).toBeNull()
    await expect(
      bob.client.mutation(api.gm.addNote, { screenId })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.gm.updateNote, {
        id: noteId,
        expectedVersion: 1,
        body: 'Volé',
      })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      alice.client.mutation(api.gm.updateNote, {
        id: noteId,
        expectedVersion: 0,
        body: 'Ancien brouillon',
      })
    ).rejects.toThrow('CONFLICT')
    expect(
      (await alice.client.query(api.gm.getScreen, { id: screenId }))?.notes[0]
        ?.body
    ).toBe(saved?.notes[0]?.body)
    const other = await alice.client.mutation(api.gm.createProject, {
      title: 'Autre campagne',
    })
    await expect(
      alice.client.mutation(api.gm.createScreen, {
        projectId: other,
        folderId,
        title: 'Référence cassée',
        format: 'digital',
      })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.gm.createFolder, {
        projectId: other,
        title: 'Intrusion',
      })
    ).rejects.toThrow('NOT_FOUND')
    const tavern = await alice.client.mutation(api.gmSheets.createSheet, {
      projectId,
      kind: 'place',
      title: 'Taverne',
    })
    const host = await alice.client.mutation(api.gmSheets.createSheet, {
      projectId,
      kind: 'npc',
      title: 'Aubergiste',
    })
    await alice.client.mutation(api.gmSheets.setSheetLinks, {
      id: host,
      targets: [tavern],
    })
    for (const collection of gmTables) {
      const exported = await alice.client.query(api.gm.exportCollection, {
        collection,
        paginationOpts: { numItems: 50, cursor: null },
      })
      expect(exported.page.length).toBeGreaterThan(0)
      expect(exported.page.every((row) => row.ownerId === alice.userId)).toBe(
        true
      )
      expect(
        (
          await bob.client.query(api.gm.exportCollection, {
            collection,
            paginationOpts: { numItems: 50, cursor: null },
          })
        ).page
      ).toEqual([])
    }
  })

  it('rejects anonymous, revoked sessions, empty titles and oversized content at public entry points', async () => {
    const backend = createBackendTest()
    const alice = await createAuthenticatedUser(backend, 'alice@example.test')
    await expect(
      backend.mutation(api.gm.createProject, { title: 'Anonyme' })
    ).rejects.toThrow()
    await expect(
      alice.client.mutation(api.gm.createProject, { title: '  ' })
    ).rejects.toThrow('INVALID_INPUT')
    const projectId = await alice.client.mutation(api.gm.createProject, {
      title: 'Campagne',
    })
    const screenId = await alice.client.mutation(api.gm.createScreen, {
      projectId,
      title: 'Screen',
      format: 'digital',
    })
    const id = await alice.client.mutation(api.gm.addNote, { screenId })
    await expect(
      alice.client.mutation(api.gm.updateNote, {
        id,
        expectedVersion: 0,
        body: 'a'.repeat(50_001),
      })
    ).rejects.toThrow('INVALID_INPUT')
    await backend.mutation(components.betterAuth.adapter.deleteOne, {
      input: {
        model: 'session',
        where: [{ field: '_id', value: alice.sessionId }],
      },
    })
    await expect(
      alice.client.query(api.gm.getScreen, { id: screenId })
    ).rejects.toThrow()
    await expect(
      alice.client.mutation(api.gm.addNote, { screenId })
    ).rejects.toThrow()
  })

  it('paginates projects and caps folder depth without accepting cross-project parents', async () => {
    const backend = createBackendTest()
    const alice = await createAuthenticatedUser(backend, 'alice@example.test')
    const projectId = await alice.client.mutation(api.gm.createProject, {
      title: 'Campagne',
    })
    await alice.client.mutation(api.gm.createProject, { title: 'Autre' })
    const first = await alice.client.query(api.gm.listProjects, {
      paginationOpts: { numItems: 1, cursor: null },
    })
    expect(first.page).toHaveLength(1)
    expect(first.isDone).toBe(false)
    const next = await alice.client.query(api.gm.listProjects, {
      paginationOpts: { numItems: 1, cursor: first.continueCursor },
    })
    expect(next.page[0]?._id).not.toBe(first.page[0]?._id)
    let parentId = await alice.client.mutation(api.gm.createFolder, {
      projectId,
      title: '1',
    })
    for (let depth = 2; depth <= 8; depth++)
      parentId = await alice.client.mutation(api.gm.createFolder, {
        projectId,
        parentId,
        title: String(depth),
      })
    await expect(
      alice.client.mutation(api.gm.createFolder, {
        projectId,
        parentId,
        title: '9',
      })
    ).rejects.toThrow('FOLDER_DEPTH_LIMIT')
  })

  it('cleans all workspace collections across multiple batches without touching a different owner', async () => {
    vi.useFakeTimers()
    const backend = createBackendTest()
    const alice = await createAuthenticatedUser(backend, 'alice@example.test')
    const bob = await createAuthenticatedUser(backend, 'bob@example.test')
    const projectId = await alice.client.mutation(api.gm.createProject, {
      title: 'Campagne',
    })
    const folderId = await alice.client.mutation(api.gm.createFolder, {
      projectId,
      title: 'Session',
    })
    const screenId = await alice.client.mutation(api.gm.createScreen, {
      projectId,
      folderId,
      title: 'Screen',
      format: 'digital',
    })
    await alice.client.mutation(api.gm.addNote, { screenId })
    const bobProject = await bob.client.mutation(api.gm.createProject, {
      title: 'À conserver',
    })
    await backend.run(async (ctx) => {
      for (let index = 0; index < 101; index++)
        await ctx.db.insert('gmNotes', {
          ownerId: alice.userId,
          projectId,
          screenId,
          body: 'À supprimer',
          version: 0,
          updatedAt: Date.now(),
        })
    })
    await backend.mutation(internal.cleanup.deletedAccount, {
      userId: alice.userId,
      email: 'alice@example.test',
    })
    await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
    await backend.run(async (ctx) => {
      for (const table of gmTables)
        expect(
          await ctx.db
            .query(table)
            .withIndex('by_owner', (q) => q.eq('ownerId', alice.userId))
            .collect()
        ).toEqual([])
      expect((await ctx.db.get('gmProjects', bobProject))?.title).toBe(
        'À conserver'
      )
      expect(await ctx.db.query('cleanupJobs').collect()).toEqual([])
    })
  })
})
