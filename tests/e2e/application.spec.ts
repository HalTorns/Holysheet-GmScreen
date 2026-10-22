import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { z } from 'zod'

import { api } from '../../convex/_generated/api'
import { backendUrl } from '../../scripts/local-config.mjs'
import {
  deleteAccountWithClient,
  SITE_URL,
  addPasskey,
  completeProfile,
  identityMailbox,
  finishIdentityConfirmation,
  createEmail,
  createResource,
  deleteAccount,
  exportAccountData,
  getAnonymousClient,
  getAuthenticatedClient,
  installAuthenticator,
  requestSignInCode,
  signInWithEmail,
} from './helpers'

const paginationOpts = { numItems: 20, cursor: null }

async function holdFirstResourceCreation(page: Page) {
  const mutationMessage = z.object({
    type: z.literal('Mutation'),
    udfPath: z.literal('resources:create'),
  })
  let release: (() => void) | undefined
  let wasHeld = false
  await page.routeWebSocket(
    `${backendUrl.replace('http:', 'ws:')}/**`,
    (socket) => {
      const server = socket.connectToServer()
      socket.onMessage((message) => {
        if (
          !wasHeld &&
          typeof message === 'string' &&
          mutationMessage.safeParse(JSON.parse(message)).success
        ) {
          wasHeld = true
          release = () => server.send(message)
          return
        }
        server.send(message)
      })
    }
  )
  return {
    waitUntilHeld: () => expect.poll(() => wasHeld).toBe(true),
    release: () => release?.(),
  }
}

test('un visiteur anonyme est redirigé et ne peut pas lire le backend privé', async ({
  page,
}) => {
  await page.goto('/app')
  await expect(page).toHaveURL(/\/sign-in(?:\?|$)/)
  await expect(page.getByLabel('Adresse e-mail', { exact: true })).toBeVisible()
  await expect(
    getAnonymousClient().query(api.resources.list, { paginationOpts })
  ).rejects.toThrow()
  expect(
    await getAnonymousClient().query(api.auth.getCurrentUser, {})
  ).toBeNull()
})

test('changer de compte réinitialise les brouillons et les données affichées dans une page déjà ouverte', async ({
  page,
}) => {
  await signInWithEmail(page, createEmail())
  const first = await getAuthenticatedClient(page.context())
  let second: Awaited<ReturnType<typeof getAuthenticatedClient>> | undefined
  const privateTitle = `Premier compte ${randomUUID()}`
  try {
    const id = await first.mutation(api.resources.create, {
      title: privateTitle,
      description: '',
    })
    await expect(page.getByText(privateTitle, { exact: true })).toBeVisible()
    await page
      .getByRole('button', { name: 'Nouvelle ressource', exact: true })
      .click()
    await page
      .getByLabel('Titre', { exact: true })
      .fill('Brouillon du premier compte')
    const secondEmail = createEmail()
    const code = await requestSignInCode(page.context(), secondEmail)
    const response = await page
      .context()
      .request.post('/api/auth/sign-in/email-otp', {
        headers: { Origin: SITE_URL },
        data: { email: secondEmail, otp: code },
      })
    expect(response.status()).toBe(200)
    second = await getAuthenticatedClient(page.context())
    // Reproduce the public visibility signal used when returning to another tab.
    await expect
      .poll(async () => {
        try {
          await page.evaluate(() =>
            document.dispatchEvent(new Event('visibilitychange'))
          )
          return await page.getByText(secondEmail, { exact: true }).count()
        } catch (error) {
          // The identity reset reloads the document while the signal is delivered.
          if (
            error instanceof Error &&
            error.message.includes('Execution context was destroyed')
          )
            return 0
          throw error
        }
      })
      .toBe(1)
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText(privateTitle, { exact: true })).toHaveCount(0)
    await completeProfile(page)
    await expect(
      page.getByRole('button', { name: 'Nouvelle ressource', exact: true })
    ).toBeEnabled()
    expect(
      (await second.query(api.resources.list, { paginationOpts })).page
    ).toEqual([])
    expect((await first.query(api.resources.get, { id }))?.title).toBe(
      privateTitle
    )
  } finally {
    if (second) await deleteAccountWithClient(second)
    await deleteAccountWithClient(first)
  }
})

test('email réel, ressources privées, révocation de session et passkeys fonctionnent ensemble', async ({
  browser,
  page,
}) => {
  test.setTimeout(180_000)
  const ownerEmail = createEmail()
  const otherEmail = createEmail()
  const ownerTitle = `Ressource propriétaire ${randomUUID()}`
  const otherTitle = `Ressource privée ${randomUUID()}`
  const otherContext = await browser.newContext({ baseURL: SITE_URL })
  const sessionContext = await browser.newContext({ baseURL: SITE_URL })
  const otherPage = await otherContext.newPage()
  const sessionPage = await sessionContext.newPage()
  let uncaughtErrors = 0
  for (const target of [page, otherPage, sessionPage]) {
    target.on('pageerror', () => {
      uncaughtErrors += 1
    })
  }
  let authenticator = await installAuthenticator(page)
  const pendingCreation = await holdFirstResourceCreation(page)

  try {
    await signInWithEmail(page, ownerEmail)
    await page
      .getByRole('button', { name: 'Nouvelle ressource', exact: true })
      .click()
    await page.getByLabel('Titre', { exact: true }).fill(ownerTitle)
    await page
      .getByRole('button', { name: 'Créer la ressource', exact: true })
      .click()
    await pendingCreation.waitUntilHeld()
    try {
      await page.keyboard.press('Escape')
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.mouse.click(4, 4)
      await expect(page.getByRole('dialog')).toBeVisible()
      await expect(
        page.getByRole('button', { name: 'Annuler', exact: true })
      ).toBeDisabled()
      await expect(page.getByLabel('Titre', { exact: true })).toBeDisabled()
    } finally {
      pendingCreation.release()
    }
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByText(ownerTitle, { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText(ownerTitle, { exact: true })).toBeVisible()
    const ownerClient = await getAuthenticatedClient(page.context())
    const forbiddenSignOut = await page
      .context()
      .request.post('/api/auth/sign-out', {
        headers: { Origin: 'https://untrusted.example' },
        data: {},
      })
    expect(forbiddenSignOut.status()).toBe(403)
    const ownerResources = await ownerClient.query(api.resources.list, {
      paginationOpts,
    })
    const ownerResource = ownerResources.page.find(
      (item) => item.title === ownerTitle
    )
    if (!ownerResource)
      throw new Error('La ressource créée est absente du backend.')

    await signInWithEmail(otherPage, otherEmail)
    await createResource(otherPage, otherTitle)
    await expect(otherPage.getByText(ownerTitle, { exact: true })).toHaveCount(
      0
    )
    const otherClient = await getAuthenticatedClient(otherContext)
    expect(
      await otherClient.query(api.resources.get, { id: ownerResource._id })
    ).toBeNull()
    await expect(
      otherClient.mutation(api.resources.update, {
        expectedUpdatedAt: 0,
        id: ownerResource._id,
        title: 'Modification interdite',
        description: '',
      })
    ).rejects.toThrow()
    await expect(
      otherClient.mutation(api.resources.remove, { id: ownerResource._id })
    ).rejects.toThrow()
    expect(
      (await ownerClient.query(api.resources.get, { id: ownerResource._id }))
        ?.title
    ).toBe(ownerTitle)

    await page
      .getByRole('button', { name: `Modifier ${ownerTitle}`, exact: true })
      .click()
    const updatedTitle = `${ownerTitle} modifiée`
    await page.getByLabel('Titre', { exact: true }).fill(updatedTitle)
    await page
      .getByRole('button', {
        name: 'Enregistrer les modifications',
        exact: true,
      })
      .click()
    await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible()

    await signInWithEmail(sessionPage, ownerEmail)
    const revokedClient = await getAuthenticatedClient(sessionContext)
    expect(
      (await revokedClient.query(api.resources.list, { paginationOpts })).page
        .length
    ).toBeGreaterThan(0)
    await page.goto('/app/security')
    await page
      .getByRole('button', { name: 'Fermer les autres sessions', exact: true })
      .click()
    await expect
      .poll(
        async () => {
          try {
            await revokedClient.query(api.resources.list, { paginationOpts })
            return false
          } catch {
            return true
          }
        },
        {
          message:
            'Le JWT déjà émis ne doit plus donner accès à la session révoquée.',
        }
      )
      .toBe(true)
    expect(
      (await ownerClient.query(api.resources.get, { id: ownerResource._id }))
        ?.title
    ).toBe(updatedTitle)
    await sessionPage.reload()
    await expect(sessionPage).toHaveURL(/\/sign-in(?:\?|$)/)

    await addPasskey(page, 'Passkey principale E2E')
    // One registration per authenticator: model a second physical device.
    await authenticator.cdp.send('WebAuthn.removeVirtualAuthenticator', {
      authenticatorId: authenticator.authenticatorId,
    })
    await authenticator.cdp.detach()
    authenticator = await installAuthenticator(page)
    await addPasskey(page, 'Passkey secondaire E2E')
    const removeMailbox = await identityMailbox(page)
    await page
      .getByRole('button', {
        name: 'Supprimer la passkey Passkey principale E2E',
        exact: true,
      })
      .click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Supprimer la passkey', exact: true })
      .click()
    await finishIdentityConfirmation(page, removeMailbox)
    await expect(
      page.getByText('Passkey principale E2E', { exact: true })
    ).toHaveCount(0)

    await page.getByRole('button', { name: 'Déconnexion', exact: true }).click()
    await expect(page).toHaveURL(`${SITE_URL}/`)
    await page.goto('/sign-in')
    // Keep browser interaction successful, but sign an authenticator response
    // whose UV flag is false. setUserVerified(false) cancels the ceremony.
    await authenticator.cdp.send('WebAuthn.setResponseOverrideBits', {
      authenticatorId: authenticator.authenticatorId,
      isBadUV: true,
    })
    const unverifiedAssertion = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          '/api/auth/passkey/verify-authentication' &&
        response.request().method() === 'POST'
    )
    await page
      .getByRole('button', {
        name: 'Se connecter avec une passkey',
        exact: true,
      })
      .click()
    const refusedAssertion = await unverifiedAssertion
    expect(refusedAssertion.status()).toBe(403)
    const assertionError: unknown = await refusedAssertion.json()
    expect(
      z
        .object({ code: z.literal('PASSKEY_USER_VERIFICATION_REQUIRED') })
        .safeParse(assertionError).success,
      'Le serveur doit exiger une vérification de l’utilisateur par la passkey.'
    ).toBe(true)
    const unverifiedSession = await page
      .context()
      .request.get('/api/auth/get-session')
    expect(
      (await unverifiedSession.json()) === null,
      'Une assertion sans PIN ni biométrie ne doit créer aucune session.'
    ).toBe(true)
    await expect(page).toHaveURL(`${SITE_URL}/sign-in`)
    await authenticator.cdp.send('WebAuthn.setResponseOverrideBits', {
      authenticatorId: authenticator.authenticatorId,
      isBadUV: false,
    })
    await page
      .getByRole('button', {
        name: 'Se connecter avec une passkey',
        exact: true,
      })
      .click()
    await expect(page).toHaveURL(`${SITE_URL}/app`)
    await expect(page.getByText(updatedTitle, { exact: true })).toBeVisible()
    await expect(page.getByText(otherTitle, { exact: true })).toHaveCount(0)
    await page
      .getByRole('button', { name: `Supprimer ${updatedTitle}`, exact: true })
      .click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Confirmer la suppression', exact: true })
      .click()
    await expect(page.getByText(updatedTitle, { exact: true })).toHaveCount(0)
    await page.reload()
    await expect(page.getByText(updatedTitle, { exact: true })).toHaveCount(0)

    const beforeDeletionTitle = `Ressource avant suppression ${randomUUID()}`
    await createResource(page, beforeDeletionTitle)
    await page.goto('/app/security')
    const exported = await exportAccountData(page)
    expect(exported.profile.email).toBe(ownerEmail)
    expect(exported.resources.map((resource) => resource.title)).toContain(
      beforeDeletionTitle
    )
    expect(exported.resources.map((resource) => resource.title)).not.toContain(
      otherTitle
    )
    const deletedClient = await getAuthenticatedClient(page.context())
    await deleteAccount(page)
    await expect(
      deletedClient.query(api.resources.list, { paginationOpts })
    ).rejects.toThrow()
    expect(
      (
        await otherClient.query(api.resources.list, { paginationOpts })
      ).page.map((resource) => resource.title)
    ).toContain(otherTitle)
    await page.goto('/app')
    await expect(page).toHaveURL(/\/sign-in(?:\?|$)/)
    await deleteAccount(otherPage)
    await expect(
      otherClient.query(api.resources.list, { paginationOpts })
    ).rejects.toThrow()
    expect(uncaughtErrors, 'Aucune erreur JavaScript non interceptée.').toBe(0)
  } finally {
    // Playwright closes the page on timeout; cleanup must preserve that failure.
    await Promise.allSettled([
      authenticator.cdp.send('WebAuthn.removeVirtualAuthenticator', {
        authenticatorId: authenticator.authenticatorId,
      }),
      otherContext.close(),
      sessionContext.close(),
    ])
    if (!page.isClosed()) await authenticator.cdp.detach()
  }
})
