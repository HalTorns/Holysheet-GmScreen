import { createHmac } from 'node:crypto'

import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import { z } from 'zod'

import { api } from '../../convex/_generated/api'
import { backendSiteUrl, mailpitUrl } from '../../scripts/local-config.mjs'
import { allowSupportUser, addPasswordCredential } from './backend-operator'
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

async function enrollMfa(page: Page, password?: string) {
  await page.goto('/app/security')
  const mfaMailbox = await identityMailbox(page)
  if (password)
    await page.getByLabel('Mot de passe actuel', { exact: true }).fill(password)
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

for (const method of ['otp', 'credentials'] as const) {
  test(`${method}: real TOTP enrollment guards existing and new sessions; a recovery code is consumed once`, async ({
    page,
    browser,
  }) => {
    const email = createEmail()
    await signInWithEmail(page, email)
    const password =
      method === 'credentials' ? 'synthetic-e2e-credential-password' : undefined
    if (password) {
      const owner = await getAuthenticatedClient(page.context())
      const user = await owner.query(api.auth.getCurrentUser, {})
      if (!user) throw new Error('Missing credential fixture owner.')
      await addPasswordCredential(user.id, password)
    }
    const other = await browser.newContext({ baseURL: SITE_URL })
    const third = await browser.newContext({ baseURL: SITE_URL })
    try {
      const otherPage = await other.newPage()
      await signInWithEmail(otherPage, email)
      const pendingClient = await getAuthenticatedClient(other)
      const { secret, backupCode } = await enrollMfa(page, password)
      const restored = await verifyLocalRestore()
      for (const table of ['twoFactor', 'sessionAssurances', 'authAudit'])
        expect(
          restored.tables[`_components/betterAuth/${table}`]
        ).toBeGreaterThan(0)
      await expect(
        pendingClient.query(api.resources.list, listArgs)
      ).rejects.toThrow()
      await expect(
        pendingClient.mutation(api.resources.create, {
          title: 'Denied pending MFA',
          description: '',
        })
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
      const code = password ? undefined : await requestSignInCode(third, email)
      expect(
        (
          await third.request.post(
            password
              ? '/api/auth/sign-in/email'
              : '/api/auth/sign-in/email-otp',
            {
              headers: { Origin: SITE_URL },
              data: password ? { email, password } : { email, otp: code },
            }
          )
        ).status()
      ).toBe(200)
      const thirdPage = await third.newPage()
      await thirdPage.goto('/app')
      await expect(thirdPage).toHaveURL(`${SITE_URL}/verify-mfa`)
      const primary = await getAuthenticatedClient(third)
      await expect(
        primary.query(api.resources.list, listArgs)
      ).rejects.toThrow()
      await expect(
        primary.mutation(api.resources.create, {
          title: 'Denied primary',
          description: '',
        })
      ).rejects.toThrow()
      await thirdPage
        .getByRole('button', { name: 'Utiliser un code de récupération' })
        .click()
      await thirdPage.getByLabel('Code de récupération').fill(backupCode)
      await thirdPage
        .getByRole('button', { name: 'Vérifier le code', exact: true })
        .click()
      await expect(thirdPage).toHaveURL(`${SITE_URL}/app`)
      await thirdPage.reload()
      await expect(thirdPage).toHaveURL(`${SITE_URL}/app`)
      const verified = await getAuthenticatedClient(third)
      expect((await verified.query(api.resources.list, listArgs)).page).toEqual(
        []
      )
      await verified.mutation(api.resources.create, {
        title: 'After MFA',
        description: '',
      })
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

  test(`${method}: cancelling a failed MFA sign-in restores the browser session; success replaces it`, async ({
    page,
  }) => {
    const email = createEmail()
    await signInWithEmail(page, email)
    const password =
      method === 'credentials' ? 'synthetic-e2e-credential-password' : undefined
    if (password) {
      const owner = await getAuthenticatedClient(page.context())
      const user = await owner.query(api.auth.getCurrentUser, {})
      if (!user) throw new Error('Missing credential fixture owner.')
      await addPasswordCredential(user.id, password)
    }
    const { secret } = await enrollMfa(page, password)
    const previous = await getAuthenticatedClient(page.context())
    let cleanup = previous
    try {
      const previousSession = z
        .object({ session: z.object({ id: z.string() }) })
        .parse(await (await page.request.get('/api/auth/get-session')).json())
      const retryCode = password
        ? undefined
        : await requestSignInCode(page.context(), email)
      expect(
        (
          await page.request.post(
            password
              ? '/api/auth/sign-in/email'
              : '/api/auth/sign-in/email-otp',
            {
              headers: { Origin: SITE_URL },
              data: password ? { email, password } : { email, otp: retryCode },
            }
          )
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
          new URL(response.url()).pathname ===
          '/api/auth/pending-sign-in/cancel'
      )
      await page.getByRole('button', { name: /Annuler/ }).click()
      expect((await cancellation).status()).toBe(200)
      await expect(page).toHaveURL(`${SITE_URL}/app`)
      const resumedSession = z
        .object({ session: z.object({ id: z.string() }) })
        .parse(await (await page.request.get('/api/auth/get-session')).json())
      expect(resumedSession.session.id).toBe(previousSession.session.id)
      expect(await previous.query(api.auth.getCurrentUser, {})).not.toBeNull()
      if (password) {
        await page.goto('/sign-in')
        await page
          .getByLabel('Email du compte avec mot de passe', { exact: true })
          .fill(email)
        await page.getByLabel('Mot de passe', { exact: true }).fill(password)
        await page
          .getByRole('button', {
            name: 'Se connecter avec un mot de passe',
            exact: true,
          })
          .click()
        await expect(page).toHaveURL(`${SITE_URL}/verify-mfa`)
      } else {
        const successfulRetry = await requestSignInCode(page.context(), email)
        expect(
          (
            await page.request.post('/api/auth/sign-in/email-otp', {
              headers: { Origin: SITE_URL },
              data: { email, otp: successfulRetry },
            })
          ).status()
        ).toBe(200)
      }
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
}

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
        `${mailpitUrl}/api/v1/search?${new URLSearchParams({ query: `to:${email}` })}`
      )
      const data = z
        .object({ messages: z.array(z.object({ ID: z.string() })) })
        .parse(await search.json())
      const id = data.messages[0]?.ID
      if (!id) return false
      const message = z
        .object({ Text: z.string() })
        .parse(await (await fetch(`${mailpitUrl}/api/v1/message/${id}`)).json())
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
    `${backendSiteUrl}/api/auth/email-otp/send-verification-otp`,
    {
      method: 'POST',
      headers: { Origin: SITE_URL, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: createEmail(), type: 'sign-in' }),
    }
  )
  expect(direct.status).toBe(403)
  expect((await fetch(`${backendSiteUrl}/api/auth/convex/jwks`)).status).toBe(
    200
  )
})

test('credential MFA management requires both current password and operation-bound identity proof', async ({
  page,
}) => {
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  const user = await client.query(api.auth.getCurrentUser, {})
  if (!user) throw new Error('Missing credential owner.')
  const password = 'synthetic-e2e-management-password'
  await addPasswordCredential(user.id, password)
  try {
    const withoutProof = async (operation: 'enable' | 'disable') => {
      const response = await page.request.post(
        `/api/auth/two-factor/${operation}`,
        {
          headers: { Origin: SITE_URL },
          data: { password },
        }
      )
      expect(response.status()).toBe(403)
      expect(
        z.object({ code: z.string() }).parse(await response.json()).code
      ).toBe('IDENTITY_CONFIRMATION_REQUIRED')
    }
    await withoutProof('enable')
    await page.goto('/app/security')
    await page
      .getByLabel('Mot de passe actuel', { exact: true })
      .fill('incorrect-password')
    const mailbox = await identityMailbox(page)
    const refusedEnable = page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname === '/api/auth/two-factor/enable'
    )
    await page
      .getByRole('button', { name: 'Activer la MFA', exact: true })
      .click()
    await finishIdentityConfirmation(page, mailbox)
    const refused = await refusedEnable
    expect(refused.status()).toBe(400)
    expect(
      z.object({ code: z.string() }).parse(await refused.json()).code
    ).toBe('INVALID_PASSWORD')
    await expect(page.getByRole('alert')).toContainText('Activation refusée')
    await enrollMfa(page, password)
    await withoutProof('disable')
    for (const valid of [false, true]) {
      await page
        .getByLabel('Mot de passe actuel', { exact: true })
        .fill(valid ? password : 'incorrect-password')
      const confirmationMailbox = await identityMailbox(page)
      const response = page.waitForResponse(
        (result) =>
          new URL(result.url()).pathname === '/api/auth/two-factor/disable'
      )
      const reloaded = valid ? page.waitForEvent('load') : null
      page.once('dialog', (dialog) => {
        void dialog.accept()
      })
      await page
        .getByRole('button', { name: 'Désactiver la MFA', exact: true })
        .click()
      await finishIdentityConfirmation(page, confirmationMailbox)
      const result = await response
      expect(result.status()).toBe(valid ? 200 : 400)
      if (reloaded) await reloaded
      else
        expect(
          z.object({ code: z.string() }).parse(await result.json()).code
        ).toBe('INVALID_PASSWORD')
      if (!valid)
        await expect(page.getByRole('alert')).toContainText(
          'Désactivation refusée'
        )
    }
    await expect(
      page.getByRole('button', { name: 'Activer la MFA', exact: true })
    ).toBeVisible()
  } finally {
    await deleteAccountWithClient(await getAuthenticatedClient(page.context()))
  }
})

// Hydrated sign-in cannot detect a native GET submission before React starts.
// Inspect the real SSR form with JavaScript disabled, without entering secrets.
test('credential SSR form cannot submit a password in a URL before hydration', async ({
  browser,
}) => {
  const context = await browser.newContext({
    baseURL: SITE_URL,
    javaScriptEnabled: false,
  })
  try {
    const page = await context.newPage()
    await page.goto('/sign-in')
    const form = page.getByRole('form', { name: 'Connexion avec mot de passe' })
    await expect(form).toHaveAttribute('method', 'post')
    await expect(
      form.getByLabel('Mot de passe', { exact: true })
    ).toBeDisabled()
    await expect(
      form.getByRole('button', { name: 'Se connecter avec un mot de passe' })
    ).toBeDisabled()
  } finally {
    await context.close()
  }
})
