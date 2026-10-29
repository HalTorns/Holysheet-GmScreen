import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import { ConvexError } from 'convex/values'

import { api } from '../../convex/_generated/api'
import { insertAuthFixture, insertResourceFixture } from './backend-operator'
import { verifyLocalRestore } from './backup'
import {
  createEmail,
  deleteAccountWithClient,
  deleteOrganizationWithClient,
  getAuthenticatedClient,
  signInWithEmail,
  SITE_URL,
  waitForHydration,
} from './helpers'

async function expectRemoved(operation: Promise<unknown>) {
  try {
    await operation
    throw new Error('Operation unexpectedly succeeded')
  } catch (error) {
    expect(error).toBeInstanceOf(ConvexError)
    expect(error instanceof ConvexError ? error.data : null).toMatchObject({
      code: 'SURFACE_REMOVED',
    })
  }
}

test('organizations refuse creation and invitations while legacy export and deletion remain available', async ({
  page,
}) => {
  test.setTimeout(180_000)
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  const owner = await client.query(api.auth.getCurrentUser, {})
  if (!owner) throw new Error('Missing organization owner')
  let organizationId: string | undefined
  try {
    await expect(
      page.getByRole('link', { name: 'Organisations', exact: true })
    ).toHaveCount(0)
    const response = await page.goto('/app/organizations')
    await waitForHydration(page)
    expect(response?.status()).toBe(404)
    await expectRemoved(
      client.mutation(api.organizations.create, { name: 'Refusée' })
    )
    for (const endpoint of ['create', 'invite-member']) {
      const native = await page.request.post(
        `/api/auth/organization/${endpoint}`,
        {
          headers: { Origin: SITE_URL },
          data: {
            name: 'Refusée',
            slug: randomUUID(),
            email: createEmail(),
            role: 'member',
          },
        }
      )
      expect(native.status()).toBe(403)
    }
    organizationId = insertAuthFixture('organization', {
      name: 'Historique C2',
      slug: randomUUID(),
      createdAt: Date.now(),
    })
    insertAuthFixture('member', {
      organizationId,
      userId: owner.id,
      role: 'owner',
      createdAt: Date.now(),
    })
    insertAuthFixture('invitation', {
      organizationId,
      email: createEmail(),
      role: 'member',
      status: 'pending',
      createdAt: Date.now(),
      inviterId: owner.id,
      expiresAt: Date.now() + 60_000,
    })
    insertResourceFixture(owner.id, 'Historique partagée', organizationId)
    await expectRemoved(
      client.mutation(api.organizations.invite, {
        organizationId,
        email: createEmail(),
        role: 'member',
      })
    )
    const exported = await client.query(api.organizations.exportResources, {
      organizationId,
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(exported.page.map((row) => row.title)).toContain(
      'Historique partagée'
    )
    const account = await client.query(api.account.exportData, {
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(account.organizations.some((row) => row.id === organizationId)).toBe(
      true
    )
    expect(account.resources.page).toEqual([])
    const restored = await verifyLocalRestore()
    for (const table of ['organization', 'member', 'invitation'])
      expect(
        restored.tables[`_components/betterAuth/${table}`]
      ).toBeGreaterThan(0)
    expect(restored.tables.resources).toBeGreaterThan(0)
    await deleteOrganizationWithClient(client, organizationId)
    organizationId = undefined
    expect(await client.query(api.organizations.list, {})).toEqual([])
  } finally {
    if (organizationId)
      await deleteOrganizationWithClient(client, organizationId)
    await deleteAccountWithClient(client)
  }
})
