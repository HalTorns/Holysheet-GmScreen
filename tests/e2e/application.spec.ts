import { expect, test } from '@playwright/test'

import { api } from '../../convex/_generated/api'
import {
  createEmail,
  deleteAccountWithClient,
  getAnonymousClient,
  getAuthenticatedClient,
  signInWithEmail,
  waitForHydration,
} from './helpers'

// GM domain journeys own CRUD, concurrent editing, session revocation and export.
// This contract owns the removed routes and anonymous access at the real entry.
test('anonymous access is refused and retired surfaces expose no UI', async ({
  page,
}) => {
  await page.goto('/app')
  await waitForHydration(page)
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/)
  await expect(
    getAnonymousClient().query(api.gm.listProjects, {
      paginationOpts: { numItems: 10, cursor: null },
    })
  ).rejects.toThrow()
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  try {
    for (const path of ['/app/organizations', '/app/resources']) {
      const response = await page.goto(path)
      await waitForHydration(page)
      expect(response?.status()).toBe(404)
      await expect(
        page.getByRole('button', { name: 'Nouvelle ressource', exact: true })
      ).toHaveCount(0)
      await expect(
        page.getByRole('button', { name: 'Créer l’organisation', exact: true })
      ).toHaveCount(0)
    }
  } finally {
    await deleteAccountWithClient(client)
  }
})
