import { randomUUID } from 'node:crypto'
import { expect, test } from '@playwright/test'
import type { ConvexHttpClient } from 'convex/browser'
import { api } from '../../convex/_generated/api'
import {
  addPasskey,
  createEmail,
  createResource,
  getAuthenticatedClient,
  installAuthenticator,
  signInWithEmail,
} from './helpers'
import { verifyLocalRestore } from './backup'

test('un export restaure réellement ressources et passkeys dans un backend isolé', async ({
  page,
}) => {
  test.setTimeout(180_000)
  const title = `Ressource sauvegardée ${randomUUID()}`
  const { cdp, authenticatorId } = await installAuthenticator(page)
  let client: ConvexHttpClient | undefined
  try {
    await signInWithEmail(page, createEmail())
    client = await getAuthenticatedClient(page.context())
    await createResource(page, title)
    await page.goto('/app/security')
    await addPasskey(page, 'Passkey sauvegardée E2E')

    const report = await verifyLocalRestore()
    expect(report.tables.resources).toBeGreaterThan(0)
    expect(report.tables['_components/betterAuth/passkey']).toBeGreaterThan(0)
    expect(report.tables['_components/betterAuth/user']).toBeGreaterThan(0)
    expect(report.tables['_components/betterAuth/session']).toBeGreaterThan(0)

    // The live source remains usable after the disposable restore is removed.
    const resources = await client.query(api.resources.list, {
      paginationOpts: { numItems: 20, cursor: null },
    })
    expect(resources.page.some((resource) => resource.title === title)).toBe(
      true,
    )
  } finally {
    if (client) {
      await client.mutation(api.account.deleteAccount, {
        confirmation: 'DELETE',
      })
    }
    await cdp
      .send('WebAuthn.removeVirtualAuthenticator', { authenticatorId })
      .catch(() => {})
    if (!page.isClosed()) await cdp.detach()
  }
})
