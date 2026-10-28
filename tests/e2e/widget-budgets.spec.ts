import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'

import { expect, test } from '@playwright/test'
import type { FunctionReturnType } from 'convex/server'
import { ConvexError } from 'convex/values'

import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { defaultWidgetStyle, gmTables } from '../../shared/gm'
import { readScreen } from '../helpers/gm-screen'
import {
  completeProfile,
  waitForHydration,
  createEmail,
  deleteAccountWithClient,
  getAuthenticatedClient,
  readMailbox,
  waitForVerificationCode,
} from './helpers'

// Service limits are owned by this CI test, not by the in-memory convex-test DB.
// No quota bypass or fixture-only backend endpoint; every write is a product API.
test('maximum note duplication, retention, export and cleanup fit the real backend budgets', async ({
  page,
  context,
}) => {
  test.setTimeout(900_000)
  const email = createEmail()
  const password = `Synthetic-${randomUUID()}`
  let client: Awaited<ReturnType<typeof getAuthenticatedClient>> | undefined
  try {
    await page.goto('/sign-in')
    await waitForHydration(page)
    await page
      .getByRole('button', { name: 'Créer un compte', exact: true })
      .click()
    await page
      .getByLabel('Pseudo', { exact: true })
      .fill(`Budget ${randomUUID().slice(0, 8)}`)
    await page.getByLabel('Adresse email', { exact: true }).fill(email)
    await page.getByLabel('Mot de passe', { exact: true }).fill(password)
    const previous = new Set(await readMailbox(email))
    await page
      .getByRole('button', { name: 'Créer mon compte', exact: true })
      .click()
    await page
      .getByLabel('Code de vérification', { exact: true })
      .fill(await waitForVerificationCode(email, previous))
    await page
      .getByRole('button', { name: 'Vérifier mon adresse', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Retrouvez votre table.' })
    ).toBeVisible()
    await page.getByLabel('Mot de passe', { exact: true }).fill(password)
    await page
      .getByRole('button', { name: 'Se connecter', exact: true })
      .click()
    await expect(page).toHaveURL(/\/app$/)
    await completeProfile(page)
    const authenticated = await getAuthenticatedClient(context)
    client = authenticated
    const resource = async <T>(action: () => Promise<T>): Promise<T> => {
      await delay(2100)
      return action()
    }
    const projectId = await resource(() =>
      authenticated.mutation(api.gm.createProject, {
        title: 'Budget synthétique',
      })
    )
    const screenId = await resource(() =>
      authenticated.mutation(api.gm.createScreen, {
        projectId,
        title: 'Budget maximal',
        format: 'digital',
      })
    )
    const structure = async () => {
      const result = await authenticated.query(api.gm.getScreen, {
        id: screenId,
      })
      if (!result) throw new Error('Missing Screen')
      expect(result).not.toHaveProperty('notes')
      return result
    }
    const digital = async () => {
      const layout = (await structure()).layouts.find(
        (p) => p.kind === 'digital'
      )
      if (!layout) throw new Error('Missing layout')
      return layout
    }
    const originals: Id<'gmNotes'>[] = []
    for (let index = 0; index < 20; index++)
      originals.push(
        await resource(() =>
          authenticated.mutation(api.gm.addNote, { screenId })
        )
      )
    // Fill 20 independent subjects with 20 full snapshots each, paced below 120/min.
    const body = '界'.repeat(49_999)
    for (const id of originals) {
      for (let version = 0; version <= 20; version++) {
        await delay(550)
        await authenticated.mutation(api.gm.updateNote, {
          id,
          expectedVersion: version,
          body: `${body}${version % 2 ? '甲' : '乙'}`,
        })
      }
    }
    const initial = await digital()
    await authenticated.mutation(api.gmEditor.updateLayout, {
      id: initial._id,
      expectedVersion: initial.version,
      name: initial.name,
      width: initial.width,
      height: initial.height,
      placements: initial.placements.map((p) => ({
        ...p,
        groupId: 'maximal',
        style: defaultWidgetStyle,
      })),
    })
    for (let index = 0; index < 6; index++)
      await resource(() =>
        authenticated.mutation(api.gmEditor.createProfile, {
          sourceId: initial._id,
          name: `Budget ${index}`,
        })
      )
    expect((await structure()).layouts).toHaveLength(8)
    const change = async (
      ids: Id<'gmNotes'>[],
      operation: 'duplicate' | 'trash'
    ) => {
      const layout = await digital()
      const notes: { id: Id<'gmNotes'>; version: number }[] = []
      for (const id of ids) {
        const content = await authenticated.query(
          api.gmWidgets.getNoteContent,
          { id }
        )
        notes.push({ id, version: content.version })
      }
      return resource(() =>
        authenticated.mutation(api.gmWidgets.changeNotes, {
          layoutId: layout._id,
          expectedVersion: layout.version,
          notes,
          operation,
        })
      )
    }
    // 100 trash + 100 live, all full bodies. Each duplication copies 20 bodies.
    for (let batch = 0; batch < 5; batch++) {
      const copies = await change(originals, 'duplicate')
      await change(copies, 'trash')
    }
    const disposable: Id<'gmNotes'>[] = []
    for (let batch = 0; batch < 4; batch++)
      disposable.push(...(await change(originals, 'duplicate')))
    const trash = await authenticated.query(api.gmWidgets.listTrash, {
      screenId,
      paginationOpts: { numItems: 10, cursor: null },
    })
    const firstTrash = trash.page[0]
    const firstLive = disposable.pop()
    if (!firstTrash || !firstLive) throw new Error('Missing budget fixtures')
    await resource(() =>
      authenticated.mutation(api.gmWidgets.purgeNote, {
        id: firstTrash._id,
        expectedVersion: firstTrash.version,
        confirmation: 'DELETE_NOTE',
      })
    )
    await change([firstLive], 'trash')
    let trashVersion = 1
    // Eight profile histories retain 20 snapshots with 99/100 styled placements.
    for (let revision = 0; revision < 11; revision++) {
      await resource(() =>
        authenticated.mutation(api.gmWidgets.restoreNote, {
          id: firstLive,
          expectedVersion: trashVersion,
        })
      )
      await change([firstLive], 'trash')
      trashVersion += 2
    }
    // Free 19 trash slots, then remove 19 live widgets: the final duplicate has
    // 20 full note sources and eight full retained profile histories together.
    let purged = 0
    while (purged < 19) {
      const result = await authenticated.query(api.gmWidgets.listTrash, {
        screenId,
        paginationOpts: { numItems: 10, cursor: null },
      })
      for (const note of result.page.slice(0, 19 - purged)) {
        await resource(() =>
          authenticated.mutation(api.gmWidgets.purgeNote, {
            id: note._id,
            expectedVersion: note.version,
            confirmation: 'DELETE_NOTE',
          })
        )
        purged++
      }
    }
    await change(disposable.slice(0, 19), 'trash')
    const copies = await change(originals, 'duplicate')
    expect(copies).toHaveLength(20)
    const final = await readScreen(authenticated, { id: screenId })
    expect(final?.notes).toHaveLength(100)
    expect(final?.notes.every((n) => n.body.length === 50_000)).toBe(true)
    expect(final?.layouts.every((p) => p.placements.length === 100)).toBe(true)
    // Sur un backend réel, le message client est générique (« Server Error ») :
    // le code métier se lit dans ConvexError.data.
    const overflow = await resource(() =>
      authenticated.mutation(api.gm.addNote, { screenId })
    ).then(
      () => null,
      (error_: unknown) => error_
    )
    expect(overflow).toBeInstanceOf(ConvexError)
    expect(
      overflow instanceof ConvexError ? overflow.data : null
    ).toMatchObject({ code: 'SCREEN_LIMIT' })
    let trashCount = 0
    let trashCursor: string | null = null
    for (;;) {
      const result: FunctionReturnType<typeof api.gmWidgets.listTrash> =
        await authenticated.query(api.gmWidgets.listTrash, {
          screenId,
          paginationOpts: { numItems: 100, cursor: trashCursor },
        })
      expect(result.page.length).toBeLessThanOrEqual(10)
      trashCount += result.page.length
      if (result.isDone) break
      trashCursor = result.continueCursor
    }
    expect(trashCount).toBe(100)
    // Include full F1 payloads in the cleanup transaction's simultaneous budget.
    for (let index = 0; index < 5; index++) {
      const sheetId = await resource(() =>
        authenticated.mutation(api.gmSheets.createSheet, {
          projectId,
          kind: 'note',
          title: `Pleine ${index}`,
        })
      )
      await resource(() =>
        authenticated.mutation(api.gmSheets.updateSheet, {
          id: sheetId,
          expectedVersion: 0,
          kind: 'note',
          title: `Pleine ${index}`,
          summary: '界'.repeat(500),
          body: '界'.repeat(50_000),
          fields: Array.from({ length: 40 }, () => ({
            label: '界'.repeat(60),
            value: '界'.repeat(2000),
          })),
        })
      )
    }
    for (const collection of [
      'gmNotes',
      'gmWidgetContents',
      'gmEditorHistory',
      'gmSheetContents',
    ] as const) {
      const result = await authenticated.query(api.gm.exportCollection, {
        collection,
        paginationOpts: { numItems: 100, cursor: null },
      })
      expect(result.page.length).toBeLessThanOrEqual(10)
      expect(result.page.length).toBeGreaterThan(0)
    }
    await deleteAccountWithClient(authenticated)
    client = undefined
    // Account access closes immediately; async cleanup is checked in backend tests.
    for (const collection of gmTables)
      await expect(
        authenticated.query(api.gm.exportCollection, {
          collection,
          paginationOpts: { numItems: 10, cursor: null },
        })
      ).rejects.toThrow()
  } finally {
    if (client) await deleteAccountWithClient(client)
  }
})
