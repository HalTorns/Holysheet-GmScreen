import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import type { ConvexHttpClient } from 'convex/browser'
import { ConvexError } from 'convex/values'

import { api } from '../../convex/_generated/api'
import { verifyLocalRestore } from './backup'
import {
  deleteAccountWithClient,
  deleteOrganizationWithClient,
  finishIdentityConfirmation,
  identityMailbox,
  SITE_URL,
  createEmail,
  createResource,
  exportAccountData,
  getAnonymousClient,
  getAuthenticatedClient,
  signInWithEmail,
} from './helpers'

test.beforeAll(async () => {
  const expected = process.env.PLAYWRIGHT_EXPECT_ORGANIZATIONS
  if (expected === undefined) return
  expect(['false', 'true']).toContain(expected)
  const capabilities = await getAnonymousClient().query(
    api.capabilities.get,
    {}
  )
  // A CI matrix leg must fail if it would silently exercise the other mode.
  expect(capabilities.organizations).toBe(expected === 'true')
})

async function expectErrorCode(operation: Promise<unknown>, code: string) {
  let refused: unknown
  try {
    await operation
  } catch (error) {
    refused = error
  }
  const details: unknown = refused instanceof ConvexError ? refused.data : null
  expect(
    refused instanceof ConvexError &&
      typeof details === 'object' &&
      details !== null &&
      'code' in details &&
      details.code === code
  ).toBe(true)
}

test('le mode personnel cache les organisations et refuse leur API', async ({
  page,
}) => {
  test.skip(
    (await getAnonymousClient().query(api.capabilities.get, {})).organizations,
    'Ce parcours exige le mode personnel.'
  )
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  try {
    await expect(
      page.getByRole('link', { name: 'Organisations', exact: true })
    ).toHaveCount(0)
    await page.goto('/app/organizations')
    await expect(page).toHaveURL(`${SITE_URL}/app`)
    await expectErrorCode(
      client.mutation(api.organizations.create, { name: 'Non activé' }),
      'MODULE_DISABLED'
    )
    const response = await page
      .context()
      .request.post('/api/auth/organization/create', {
        headers: { Origin: SITE_URL },
        data: { name: 'Contournement', slug: 'bypass' },
      })
    expect(response.status()).toBe(403)
    expect(
      (
        await client.query(api.resources.list, {
          paginationOpts: { numItems: 20, cursor: null },
        })
      ).page
    ).toEqual([])
  } finally {
    await deleteAccountWithClient(client)
  }
})

test('une organisation partage ses ressources selon les rôles et révoque immédiatement un membre', async ({
  browser,
  page,
}) => {
  const enabled = (await getAnonymousClient().query(api.capabilities.get, {}))
    .organizations
  if (process.env.PLAYWRIGHT_ORGANIZATIONS) expect(enabled).toBe(true)
  test.skip(
    !enabled,
    'Ce parcours exige le mode organisations ; utiliser pnpm test:e2e:organizations.'
  )
  test.setTimeout(180_000)
  const ownerEmail = createEmail()
  const readerEmail = createEmail()
  const name = `Équipe ${randomUUID()}`
  const title = `Ressource partagée ${randomUUID()}`
  const readerContext = await browser.newContext({
    baseURL: SITE_URL,
    viewport: { width: 390, height: 844 },
  })
  const readerPage = await readerContext.newPage()
  let owner: ConvexHttpClient | undefined
  let reader: ConvexHttpClient | undefined
  let organizationId: string | undefined
  let uncaughtErrors = 0
  for (const target of [page, readerPage])
    target.on('pageerror', () => {
      uncaughtErrors++
    })
  try {
    await signInWithEmail(page, ownerEmail)
    owner = await getAuthenticatedClient(page.context())
    await page.getByRole('link', { name: 'Organisations', exact: true }).click()
    await page.getByLabel('Nom de l’organisation', { exact: true }).fill(name)
    await page
      .getByRole('button', { name: 'Créer l’organisation', exact: true })
      .click()
    await expect(page).toHaveURL(/\/app\/organizations\/[^/]+$/)
    organizationId = new URL(page.url()).pathname.split('/').at(-1)
    if (!organizationId)
      throw new Error('L’organisation créée est absente de la route.')
    await createResource(page, title)
    await page
      .getByLabel('Adresse e-mail du membre', { exact: true })
      .fill(readerEmail)
    await page
      .getByLabel('Rôle à l’arrivée', { exact: true })
      .selectOption('viewer')
    await page
      .getByRole('button', { name: 'Inviter ce membre', exact: true })
      .click()
    await expect(page.getByText(readerEmail, { exact: true })).toBeVisible()

    await signInWithEmail(readerPage, readerEmail)
    reader = await getAuthenticatedClient(readerContext)
    const readerUser = await reader.query(api.auth.getCurrentUser, {})
    if (!readerUser) throw new Error('Le compte invité est absent.')
    const readerName = readerUser.name || readerUser.email
    await readerPage
      .getByRole('link', { name: 'Organisations', exact: true })
      .click()
    await readerPage
      .getByRole('button', { name: 'Accepter l’invitation', exact: true })
      .click()
    await expect(readerPage.getByText(title, { exact: true })).toBeVisible()
    await expect(
      readerPage.getByRole('button', {
        name: 'Nouvelle ressource',
        exact: true,
      })
    ).toHaveCount(0)
    await expect(
      readerPage.getByRole('button', {
        name: `Modifier ${title}`,
        exact: true,
      })
    ).toHaveCount(0)
    const resources = await reader.query(api.resources.list, {
      organizationId,
      paginationOpts: { numItems: 20, cursor: null },
    })
    const shared = resources.page[0]
    if (!shared) throw new Error('La ressource commune est absente.')
    await expectErrorCode(
      reader.mutation(api.resources.update, {
        expectedUpdatedAt: 0,
        id: shared._id,
        title: 'Sans permission',
        description: '',
      }),
      'FORBIDDEN'
    )
    expect(
      (
        await reader.query(api.resources.list, {
          paginationOpts: { numItems: 20, cursor: null },
        })
      ).page
    ).toEqual([])
    const native = await page
      .context()
      .request.post('/api/auth/organization/remove-member', {
        headers: { Origin: SITE_URL },
        data: { organizationId, memberIdOrEmail: readerEmail },
      })
    expect(native.status()).toBe(403)

    await page
      .getByLabel(`Rôle de ${readerName}`, { exact: true })
      .selectOption('member')
    await expect(
      readerPage.getByRole('button', {
        name: 'Nouvelle ressource',
        exact: true,
      })
    ).toBeVisible()
    await createResource(readerPage, 'Créée par un membre')
    await expect(
      page.getByText('Créée par un membre', { exact: true })
    ).toBeVisible()
    for (const width of [320, 390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      const geometry = await page.evaluate(() => ({
        viewport: window.innerWidth,
        documentWidth: document.documentElement.scrollWidth,
        overflowing: [...document.querySelectorAll('body *')]
          .filter(
            (element) =>
              element.getBoundingClientRect().right > window.innerWidth + 1
          )
          .slice(0, 12)
          .map((element) => ({
            tag: element.tagName,
            className:
              typeof element.className === 'string' ? element.className : '',
            right: Math.round(element.getBoundingClientRect().right),
          })),
      }))
      expect(
        geometry.documentWidth <= geometry.viewport,
        JSON.stringify(geometry)
      ).toBe(true)
    }
    await readerPage.goto('/app/security')
    const exported = await exportAccountData(readerPage)
    expect(
      exported.organizations.some(
        (item) => item.id === organizationId && item.role === 'member'
      )
    ).toBe(true)
    expect(exported.resources).toEqual([])
    await page
      .getByLabel('Nom de l’organisation', { exact: true })
      .fill(`${name} renommée`)
    await page
      .getByRole('button', { name: 'Renommer l’organisation', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: `${name} renommée.`, exact: true })
    ).toBeVisible()
    await owner.mutation(api.organizations.invite, {
      organizationId,
      email: createEmail(),
      role: 'member',
    })
    const report = await verifyLocalRestore()
    expect(
      report.tables['_components/betterAuth/organization']
    ).toBeGreaterThan(0)
    expect(report.tables['_components/betterAuth/member']).toBeGreaterThan(1)
    expect(report.tables['_components/betterAuth/invitation']).toBeGreaterThan(
      0
    )
    expect(report.tables.resources).toBeGreaterThan(0)
    await readerPage.goto(`/app/organizations/${organizationId}`)
    await page
      .getByRole('button', { name: `Retirer ${readerName}`, exact: true })
      .click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmer le retrait', exact: true })
      .click()
    const revokedClient = reader
    const revokedOrganizationId = organizationId
    await expect
      .poll(async () => {
        try {
          await revokedClient.query(api.resources.list, {
            organizationId: revokedOrganizationId,
            paginationOpts: { numItems: 20, cursor: null },
          })
          return false
        } catch {
          return true
        }
      })
      .toBe(true)
    expect(
      (await owner.query(api.resources.get, { id: shared._id }))?.title
    ).toBe(title)
    await readerPage.goto(`/app/organizations/${organizationId}`)
    await expect(readerPage.getByText(title, { exact: true })).toHaveCount(0)
    const deleteMailbox = await identityMailbox(page)
    await page
      .getByRole('button', { name: 'Supprimer l’organisation', exact: true })
      .click()
    await page
      .getByLabel('Saisissez SUPPRIMER pour l’organisation', { exact: true })
      .fill('SUPPRIMER')
    await page
      .getByRole('button', {
        name: 'Supprimer définitivement l’organisation',
        exact: true,
      })
      .click()
    await finishIdentityConfirmation(page, deleteMailbox)
    await expect(page).toHaveURL(`${SITE_URL}/app/organizations`)
    expect(await owner.query(api.organizations.list, {})).toEqual([])
    organizationId = undefined
    expect(uncaughtErrors).toBe(0)
  } finally {
    try {
      if (organizationId && owner)
        await deleteOrganizationWithClient(owner, organizationId)
      if (owner) await deleteAccountWithClient(owner)
      if (reader) await deleteAccountWithClient(reader)
    } finally {
      await readerContext.close()
    }
  }
})
