import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import type { ConvexHttpClient } from 'convex/browser'

import { api } from '../../convex/_generated/api'
import {
  grantApplicationAdmin,
  insertResourceFixture,
  insertAuthFixture,
} from './backend-operator'
import { verifyLocalRestore } from './backup'
import {
  deleteAccountWithClient,
  exportAccountData,
  createEmail,
  waitForHydration,
  getAuthenticatedClient,
  signInWithEmail,
  SITE_URL,
} from './helpers'

test('un export restaure réellement ressources et passkeys dans un backend isolé', async ({
  page,
  browser,
}) => {
  test.setTimeout(180_000)
  const title = `Ressource sauvegardée ${randomUUID()}`
  const adminContext = await browser.newContext({ baseURL: SITE_URL })
  const adminPage = await adminContext.newPage()
  const email = createEmail()
  let client: ConvexHttpClient | undefined
  try {
    await signInWithEmail(page, email)
    client = await getAuthenticatedClient(page.context())
    const owner = await client.query(api.auth.getCurrentUser, {})
    if (!owner) throw new Error('Missing resource fixture owner')
    insertResourceFixture(owner.id, title)
    await client.mutation(api.gm.createProject, { title: 'Projet restauré C2' })
    await page.goto('/app/security')
    await waitForHydration(page)
    insertAuthFixture('passkey', {
      userId: owner.id,
      name: 'Passkey historique',
      publicKey: 'synthetic-restoration-public-key',
      credentialID: randomUUID(),
      counter: 0,
      deviceType: 'singleDevice',
      backedUp: false,
      createdAt: Date.now(),
    })

    await signInWithEmail(adminPage, createEmail())
    const admin = await getAuthenticatedClient(adminContext)
    const actor = await admin.query(api.auth.getCurrentUser, {})
    const target = await client.query(api.auth.getCurrentUser, {})
    if (!actor || !target)
      throw new Error('Missing restoration identity fixture')
    grantApplicationAdmin(actor.id)
    const before = await admin.query(api.userAdmin.read, {
      targetId: target.id,
    })
    await admin.mutation(api.userAdmin.apply, {
      targetId: target.id,
      expectedVersion: before.adminVersion,
      change: { kind: 'revoke' },
    })
    await signInWithEmail(page, email)
    client = await getAuthenticatedClient(page.context())
    await client.action(api.identityConfirmation.request, {
      operation: 'account.delete',
    })
    expect((await client.query(api.auth.getCurrentUser, {}))?.hasName).toBe(
      true
    )
    expect((await admin.query(api.auth.getAccessState, {}))?.isAdmin).toBe(true)
    const report = await verifyLocalRestore()
    expect(report.tables.resources).toBeGreaterThan(0)
    expect(report.tables.gmProjects).toBeGreaterThan(0)
    expect(report.tables['_components/betterAuth/passkey']).toBeGreaterThan(0)
    expect(report.tables['_components/betterAuth/user']).toBeGreaterThan(0)
    expect(report.tables['_components/betterAuth/session']).toBeGreaterThan(0)

    for (const table of [
      'identityChallenges',
      'sessionRevocations',
      'authAudit',
    ])
      expect(report.tables[`_components/betterAuth/${table}`]).toBeGreaterThan(
        0
      )

    await page.goto('/app/security')
    await waitForHydration(page)
    expect(
      (await exportAccountData(page)).resources.map((row) => row.title)
    ).toContain(title)

    // The live source remains usable after the disposable restore is removed.
    const resources = await client.query(api.account.exportData, {
      paginationOpts: { numItems: 20, cursor: null },
    })
    expect(
      resources.resources.page.some((resource) => resource.title === title)
    ).toBe(true)
  } finally {
    if (client && (await client.query(api.auth.getCurrentUser, {}))) {
      await deleteAccountWithClient(client)
    }
    await adminContext.close()
  }
})
