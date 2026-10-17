import { createHmac } from 'node:crypto'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { z } from 'zod'

import { api } from '../../convex/_generated/api'
import { allowSupportUser } from './backend-operator'
import { verifyLocalRestore } from './backup'
import {
  deleteAccountWithClient,
  identityMailbox,
  finishIdentityConfirmation,
  completeProfile,
  createEmail,
  getAuthenticatedClient,
  requestSignInCode,
  signInWithEmail,
  SITE_URL,
} from './helpers'

test.skip(
  !process.env.PLAYWRIGHT_AUTH_MODULES,
  'Optional auth modules require the guarded local launcher.'
)
const listArgs = { paginationOpts: { numItems: 10, cursor: null } }
function totp(secret: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const character of secret.replaceAll('=', '').toUpperCase()) {
    const index = alphabet.indexOf(character)
    if (index === -1) throw new Error('Invalid authenticator setup.')
    bits += index.toString(2).padStart(5, '0')
  }
  const bytes = Buffer.from(
    Array.from({ length: Math.floor(bits.length / 8) }, (_, index) =>
      Number.parseInt(bits.slice(index * 8, index * 8 + 8), 2)
    )
  )
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)))
  const hash = createHmac('sha1', bytes).update(counter).digest()
  const offset = (hash.at(-1) ?? 0) & 15
  return ((hash.readUInt32BE(offset) & 0x7f_ff_ff_ff) % 1_000_000)
    .toString()
    .padStart(6, '0')
}

async function enrollMfa(page: Page) {
  await page.goto('/app/security')
  const mfaMailbox = await identityMailbox(page)
  await page
    .getByRole('button', { name: 'Activer la MFA', exact: true })
    .click()
  await finishIdentityConfirmation(page, mfaMailbox)
  const secret = await page
    .getByLabel('Clé de configuration de l’authentificateur')
    .inputValue()
  await page
    .getByText('Afficher mes codes de récupération', { exact: true })
    .click()
  const backupCode = await page
    .locator('#mfa-heading')
    .locator('..')
    .locator('li')
    .first()
    .textContent()
  if (!backupCode) throw new Error('Missing recovery code.')
  await page
    .getByLabel('Code d’authentification', { exact: true })
    .fill(totp(secret))
  await page
    .getByRole('button', { name: 'Confirmer l’activation', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Désactiver la MFA', exact: true })
  ).toBeVisible()
  return { secret, backupCode }
}

test('real TOTP enrollment guards existing and new sessions; a recovery code is consumed once', async ({
  page,
  browser,
}) => {
  const email = createEmail()
  await signInWithEmail(page, email)
  const other = await browser.newContext({ baseURL: SITE_URL })
  const third = await browser.newContext({ baseURL: SITE_URL })
  try {
    const otherPage = await other.newPage()
    await signInWithEmail(otherPage, email)
    const pendingClient = await getAuthenticatedClient(other)
    const { secret, backupCode } = await enrollMfa(page)
    const restored = await verifyLocalRestore()
    for (const table of ['twoFactor', 'sessionAssurances', 'authAudit'])
      expect(
        restored.tables[`_components/betterAuth/${table}`]
      ).toBeGreaterThan(0)
    await expect(
      pendingClient.query(api.resources.list, listArgs)
    ).rejects.toThrow()
    await otherPage.goto('/app')
    await expect(otherPage).toHaveURL(`${SITE_URL}/verify-mfa`)
    await otherPage
      .getByLabel('Code d’authentification', { exact: true })
      .fill(totp(secret))
    await otherPage
      .getByRole('button', { name: 'Vérifier le code', exact: true })
      .click()
    await expect(otherPage).toHaveURL(`${SITE_URL}/app`)
    const code = await requestSignInCode(third, email)
    expect(
      (
        await third.request.post('/api/auth/sign-in/email-otp', {
          headers: { Origin: SITE_URL },
          data: { email, otp: code },
        })
      ).status()
    ).toBe(200)
    const thirdPage = await third.newPage()
    await thirdPage.goto('/app')
    await expect(thirdPage).toHaveURL(`${SITE_URL}/verify-mfa`)
    await thirdPage
      .getByRole('button', { name: 'Utiliser un code de récupération' })
      .click()
    await thirdPage.getByLabel('Code de récupération').fill(backupCode)
    await thirdPage
      .getByRole('button', { name: 'Vérifier le code', exact: true })
      .click()
    await expect(thirdPage).toHaveURL(`${SITE_URL}/app`)
    const repeated = await third.request.post(
      '/api/auth/two-factor/verify-backup-code',
      { headers: { Origin: SITE_URL }, data: { code: backupCode } }
    )
    expect(repeated.ok()).toBe(false)
  } finally {
    const owner = await getAuthenticatedClient(page.context())
    await deleteAccountWithClient(owner)
    await other.close()
    await third.close()
  }
})

test('cancelling a failed MFA sign-in restores the browser session; success replaces it', async ({
  page,
}) => {
  const email = createEmail()
  await signInWithEmail(page, email)
  const { secret } = await enrollMfa(page)
  const previous = await getAuthenticatedClient(page.context())
  let cleanup = previous
  try {
    const previousSession = z
      .object({ session: z.object({ id: z.string() }) })
      .parse(await (await page.request.get('/api/auth/get-session')).json())
    const retryCode = await requestSignInCode(page.context(), email)
    expect(
      (
        await page.request.post('/api/auth/sign-in/email-otp', {
          headers: { Origin: SITE_URL },
          data: { email, otp: retryCode },
        })
      ).status()
    ).toBe(200)
    await page.goto('/app')
    await expect(page).toHaveURL(`${SITE_URL}/verify-mfa`)
    const validTotp = totp(secret)
    const wrongTotp = validTotp === '000000' ? '000001' : '000000'
    await page
      .getByLabel('Code d’authentification', { exact: true })
      .fill(wrongTotp)
    await page
      .getByRole('button', { name: 'Vérifier le code', exact: true })
      .click()
    await expect(page.getByRole('alert')).toContainText('Code refusé')
    const cancellation = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/auth/pending-sign-in/cancel'
    )
    await page.getByRole('button', { name: /Annuler/ }).click()
    expect((await cancellation).status()).toBe(200)
    await expect(page).toHaveURL(`${SITE_URL}/app`)
    const resumedSession = z
      .object({ session: z.object({ id: z.string() }) })
      .parse(await (await page.request.get('/api/auth/get-session')).json())
    expect(resumedSession.session.id).toBe(previousSession.session.id)
    expect(await previous.query(api.auth.getCurrentUser, {})).not.toBeNull()
    const successfulRetry = await requestSignInCode(page.context(), email)
    expect(
      (
        await page.request.post('/api/auth/sign-in/email-otp', {
          headers: { Origin: SITE_URL },
          data: { email, otp: successfulRetry },
        })
      ).status()
    ).toBe(200)
    await page.goto('/verify-mfa')
    await page
      .getByLabel('Code d’authentification', { exact: true })
      .fill(totp(secret))
    await page
      .getByRole('button', { name: 'Vérifier le code', exact: true })
      .click()
    await expect(page).toHaveURL(`${SITE_URL}/app`)
    expect(await previous.query(api.auth.getCurrentUser, {})).toBeNull()
    cleanup = await getAuthenticatedClient(page.context())
  } finally {
    if (await cleanup.query(api.auth.getCurrentUser, {}))
      await deleteAccountWithClient(cleanup)
  }
})

test('support uses an explicit operator grant, stays read-only and can return to the actor', async ({
  page,
  browser,
}) => {
  await signInWithEmail(page, createEmail())
  await enrollMfa(page)
  const admin = await getAuthenticatedClient(page.context())
  const actor = await admin.query(api.auth.getCurrentUser, {})
  if (!actor) throw new Error('Missing authenticated actor.')
  const other = await browser.newContext({ baseURL: SITE_URL })
  const targetPage = await other.newPage()
  await signInWithEmail(targetPage, createEmail())
  const target = await getAuthenticatedClient(other)
  const user = await target.query(api.auth.getCurrentUser, {})
  if (!user) throw new Error('Missing authenticated target.')
  const resource = await target.mutation(api.resources.create, {
    title: 'Visible during support',
    description: '',
  })
  try {
    expect(
      (
        await page.context().request.post('/api/auth/admin/impersonate-user', {
          headers: { Origin: SITE_URL },
          data: { userId: user.id },
        })
      ).status()
    ).toBe(403)
    allowSupportUser(actor.id)
    await page.goto('/app/admin')
    await page.getByLabel('Identifiant stable du compte').fill(user.id)
    await page.getByRole('button', { name: 'Rechercher le compte' }).click()
    page.once('dialog', (dialog) => {
      void dialog.accept()
    })
    await page
      .getByRole('button', { name: 'Ouvrir le compte pour le support' })
      .click()
    await expect(page.getByLabel('Session de support')).toBeVisible()
    await expect(
      page.getByRole('button', { name: 'Nouvelle ressource', exact: true })
    ).toBeDisabled()
    const support = await getAuthenticatedClient(page.context())
    expect(
      (await support.query(api.resources.get, { id: resource }))?.title
    ).toBe('Visible during support')
    await expect(
      support.mutation(api.resources.remove, { id: resource })
    ).rejects.toThrow()
    const restored = await verifyLocalRestore()
    expect(
      restored.tables['_components/betterAuth/impersonations']
    ).toBeGreaterThan(0)
    const audit = await target.query(api.account.exportSecurityAudit, {
      scope: 'target',
      ...listArgs,
    })
    expect(
      audit.page.some((event) => event.event === 'admin.impersonated')
    ).toBe(true)
    await page.getByRole('button', { name: 'Revenir à mon compte' }).click()
    await expect(page.getByLabel('Session de support')).toHaveCount(0)
    expect(
      (
        await (
          await getAuthenticatedClient(page.context())
        ).query(api.auth.getCurrentUser, {})
      )?.id
    ).toBe(actor.id)
  } finally {
    allowSupportUser('')
    await deleteAccountWithClient(target)
    await deleteAccountWithClient(admin)
    await other.close()
  }
})

test('an emailed magic link creates a session once and never authenticates on replay', async ({
  page,
}) => {
  const email = createEmail()
  await page.goto('/sign-in')
  await page.getByLabel('Email pour recevoir un lien').fill(email)
  await page
    .getByRole('button', { name: 'Recevoir un lien de connexion' })
    .click()
  let link: string | undefined
  await expect
    .poll(async () => {
      const search = await fetch(
        `http://127.0.0.1:8025/api/v1/search?${new URLSearchParams({ query: `to:${email}` })}`
      )
      const data = z
        .object({ messages: z.array(z.object({ ID: z.string() })) })
        .parse(await search.json())
      const id = data.messages[0]?.ID
      if (!id) return false
      const message = z
        .object({ Text: z.string() })
        .parse(
          await (
            await fetch(`http://127.0.0.1:8025/api/v1/message/${id}`)
          ).json()
        )
      link = /http:\/\/localhost:\d+\/api\/auth\/magic-link\/verify[^\s]+/.exec(
        message.Text
      )?.[0]
      return Boolean(link)
    })
    .toBe(true)
  if (!link) throw new Error('Missing magic link.')
  try {
    const response = await page.context().request.get(link, { maxRedirects: 0 })
    expect(response.status()).toBe(302)
  } catch {
    throw new Error('Magic link validation failed; private URL omitted.')
  }
  await page.goto('/app')
  await expect(page).toHaveURL(`${SITE_URL}/app`)
  await completeProfile(page)
  try {
    await page.getByRole('button', { name: 'Déconnexion', exact: true }).click()
    try {
      await page.context().request.get(link, { maxRedirects: 0 })
    } catch {
      throw new Error('Magic link replay failed; private URL omitted.')
    }
    await expect
      .poll(async () =>
        (await page.context().request.get('/api/auth/get-session'))
          .json()
          .then((value) => value === null)
      )
      .toBe(true)
  } finally {
    await signInWithEmail(page, email)
    await deleteAccountWithClient(await getAuthenticatedClient(page.context()))
  }
})

test('the private auth bridge rejects direct Convex calls while JWKS stays public', async () => {
  const direct = await fetch(
    'http://127.0.0.1:3211/api/auth/email-otp/send-verification-otp',
    {
      method: 'POST',
      headers: { Origin: SITE_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: createEmail(), type: 'sign-in' }),
    }
  )
  expect(direct.status).toBe(403)
  expect(
    (await fetch('http://127.0.0.1:3211/api/auth/convex/jwks')).status
  ).toBe(200)
})
