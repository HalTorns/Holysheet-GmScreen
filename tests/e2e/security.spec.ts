import { expect, test } from '@playwright/test'
import type { ConvexHttpClient } from 'convex/browser'
import { z } from 'zod'

import { api } from '../../convex/_generated/api'
import { backendSiteUrl } from '../../scripts/local-config.mjs'
import { holdAuthTokenBudget } from './backend-operator'
import {
  deleteAccountWithClient,
  SITE_URL,
  createEmail,
  getAuthenticatedClient,
  requestSignInCode,
  signInWithEmail,
} from './helpers'

const invalidOtpError = z.object({ code: z.literal('INVALID_OTP') })
const publicJwksSchema = z.object({
  keys: z
    .array(
      z.object({ kid: z.string(), kty: z.string(), alg: z.string() }).loose()
    )
    .min(1),
})

test('la connexion passkey demande une vérification utilisateur obligatoire', async ({
  request,
}) => {
  const response = await request.get(
    '/api/auth/passkey/generate-authenticate-options'
  )
  expect(response.status()).toBe(200)
  expect(
    z
      .object({ userVerification: z.literal('required') })
      .safeParse(await response.json()).success,
    'Le gestionnaire de passkeys doit recevoir la même exigence de vérification que le serveur.'
  ).toBe(true)
})

test('un code email incorrect, remplacé ou déjà consommé ne crée pas de session', async ({
  browser,
}) => {
  const email = createEmail()
  const firstContext = await browser.newContext({ baseURL: SITE_URL })
  const secondContext = await browser.newContext({ baseURL: SITE_URL })
  let authenticatedClient: ConvexHttpClient | undefined
  try {
    const originalCode = await requestSignInCode(firstContext, email)
    const incorrectCode = originalCode === '000000' ? '000001' : '000000'
    const incorrect = await firstContext.request.post(
      '/api/auth/sign-in/email-otp',
      {
        headers: { Origin: SITE_URL },
        data: { email, otp: incorrectCode },
      }
    )
    expect(incorrect.status()).toBe(400)
    expect(invalidOtpError.safeParse(await incorrect.json()).success).toBe(true)

    const replacementCode = await requestSignInCode(firstContext, email)
    expect(
      replacementCode !== originalCode,
      'Un nouveau code doit remplacer le précédent sans les exposer dans la sortie du test.'
    ).toBe(true)
    const replaced = await firstContext.request.post(
      '/api/auth/sign-in/email-otp',
      {
        headers: { Origin: SITE_URL },
        data: { email, otp: originalCode },
      }
    )
    expect(replaced.status()).toBe(400)
    expect(invalidOtpError.safeParse(await replaced.json()).success).toBe(true)
    expect(
      (await (
        await firstContext.request.get('/api/auth/get-session')
      ).json()) === null,
      'Les essais refusés ne doivent pas créer de session.'
    ).toBe(true)

    const attempts = await Promise.all([
      firstContext.request.post('/api/auth/sign-in/email-otp', {
        headers: { Origin: SITE_URL },
        data: { email, otp: replacementCode },
      }),
      secondContext.request.post('/api/auth/sign-in/email-otp', {
        headers: { Origin: SITE_URL },
        data: { email, otp: replacementCode },
      }),
    ])
    expect(
      attempts
        .map((response) => response.status())
        .sort((left, right) => left - right)
    ).toEqual([200, 400])
    const successfulContext =
      attempts[0]?.status() === 200 ? firstContext : secondContext
    const refusedContext =
      successfulContext === firstContext ? secondContext : firstContext
    authenticatedClient = await getAuthenticatedClient(successfulContext)
    const user = await authenticatedClient.query(api.auth.getCurrentUser, {})
    expect(
      user?.email === email,
      'Le code valide doit authentifier le bon compte.'
    ).toBe(true)
    expect(
      (await (
        await refusedContext.request.get('/api/auth/get-session')
      ).json()) === null,
      'Le second consommateur du code ne doit recevoir aucune session.'
    ).toBe(true)
    const consumed = await refusedContext.request.post(
      '/api/auth/sign-in/email-otp',
      {
        headers: { Origin: SITE_URL },
        data: { email, otp: replacementCode },
      }
    )
    expect(consumed.status()).toBe(400)
    expect(invalidOtpError.safeParse(await consumed.json()).success).toBe(true)
  } finally {
    try {
      if (authenticatedClient) {
        await deleteAccountWithClient(authenticatedClient)
      }
    } finally {
      await Promise.allSettled([firstContext.close(), secondContext.close()])
    }
  }
})

test('les clés publiques JWT restent disponibles sous des lectures anonymes répétées', async ({
  request,
}) => {
  for (let index = 0; index < 125; index++) {
    const response = await request.get(`${backendSiteUrl}/api/auth/convex/jwks`)
    expect(response.status()).toBe(200)
    const payload = publicJwksSchema.parse(await response.json())
    for (const key of payload.keys)
      expect(
        ['d', 'p', 'q', 'dp', 'dq', 'qi', 'k', 'privateKey'].some(
          (field) => field in key
        )
      ).toBe(false)
  }
})

test('les réponses HTTP privées refusent une origine étrangère', async ({
  request,
}) => {
  const response = await request.get('/sign-in')
  expect(response.status()).toBe(200)
  const headers = response.headers()
  expect(headers['cache-control']).toBe('private, no-store')
  expect(headers['x-content-type-options']).toBe('nosniff')
  expect(headers['x-frame-options']).toBe('DENY')
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'")
  expect(headers['content-security-policy']).toContain("form-action 'self'")

  const forbidden = await request.post('/api/auth/sign-out', {
    headers: {
      Origin: 'https://untrusted.example',
      Cookie: 'better-auth.session_token=invalid-probe',
    },
    data: {},
  })
  expect(forbidden.status()).toBe(403)
})

test('la CSP de production autorise son nonce et bloque un script injecté', async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.CI && !process.env.PLAYWRIGHT_PRODUCTION,
    'La CSP stricte exige le serveur construit, lancé avec pnpm start.'
  )
  const first = await request.get('/sign-in')
  const second = await request.get('/sign-in')
  const firstPolicy = first.headers()['content-security-policy'] ?? ''
  const secondPolicy = second.headers()['content-security-policy'] ?? ''
  const firstNonce = /'nonce-([^']+)'/.exec(firstPolicy)?.[1]
  const secondNonce = /'nonce-([^']+)'/.exec(secondPolicy)?.[1]
  expect(firstNonce).toBeTruthy()
  expect(secondNonce).toBeTruthy()
  expect(secondNonce).not.toBe(firstNonce)
  expect(firstPolicy).toContain("'strict-dynamic'")
  const scriptPolicy = firstPolicy
    .split(';')
    .find((directive) => directive.trim().startsWith('script-src '))
  expect(scriptPolicy).not.toContain("'unsafe-inline'")
  expect(scriptPolicy).not.toContain("'unsafe-eval'")

  const violations: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'debug' && message.text().startsWith('CSP_PROBE:'))
      violations.push(message.text().slice('CSP_PROBE:'.length))
  })
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.debug(`CSP_PROBE:${event.effectiveDirective}`)
    })
  })
  const navigation = await page.goto('/sign-in')
  const browserPolicy = navigation?.headers()['content-security-policy'] ?? ''
  const browserNonce = /'nonce-([^']+)'/.exec(browserPolicy)?.[1]
  expect(browserNonce).toBeTruthy()
  const scriptNonces = await page
    .locator('script')
    .evaluateAll((scripts) => scripts.map((script) => script.nonce))
  expect(scriptNonces.length).toBeGreaterThan(0)
  expect(scriptNonces.every((nonce) => nonce === browserNonce)).toBe(true)
  await expect(
    page.getByLabel('Adresse e-mail', { exact: true })
  ).toBeEditable()
  expect(violations).toEqual([])

  // Dynamic scripts created through debugger evaluation inherit trust under
  // strict-dynamic. An injection into received HTML models untrusted markup.
  await page.route('**/sign-in', async (route) => {
    const response = await route.fetch()
    const html = await response.text()
    await route.fulfill({
      response,
      body: html.replace(
        '</body>',
        '<script>document.documentElement.dataset.cspProbeExecuted = "yes"</script></body>'
      ),
    })
  })
  await page.reload()
  await expect(
    page.getByLabel('Adresse e-mail', { exact: true })
  ).toBeEditable()
  await expect.poll(() => violations.includes('script-src-elem')).toBe(true)
  expect(
    await page.evaluate(() => document.documentElement.dataset.cspProbeExecuted)
  ).toBeUndefined()
})

test('public SEO is rendered with a CSP nonce and never lists private routes', async ({
  page,
}) => {
  const response = await page.goto('/')
  if (!response) throw new Error('Missing public document.')
  expect(
    await page.locator('meta[property="og:url"]').getAttribute('content')
  ).toBe(`${SITE_URL}/`)
  const jsonLd = page.locator('script[type="application/ld+json"]')
  const nonce = await jsonLd.evaluate((element) => element.nonce)
  expect(nonce.length).toBeGreaterThan(0)
  expect(
    response.headers()['content-security-policy']?.includes(`'nonce-${nonce}'`)
  ).toBe(true)
  const sitemap = await page.request.get('/sitemap.xml')
  expect(sitemap.status()).toBe(200)
  const xml = await sitemap.text()
  expect(xml).toContain(`<loc>${SITE_URL}/</loc>`)
  expect(xml).not.toContain('/app')
  expect(xml).not.toContain('/sign-in')
  expect(
    (await (await page.request.get('/robots.txt')).text()).includes(
      'Disallow: /'
    )
  ).toBe(true)
})

test('les budgets anonymes ne déconnectent pas un utilisateur et le quota du token est distinct de la session', async ({
  page,
  playwright,
}) => {
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  const anonymous = await playwright.request.newContext({ baseURL: SITE_URL })
  try {
    let limited = false
    for (let batch = 0; batch < 16; batch++) {
      const responses = await Promise.all(
        Array.from({ length: 10 }, () =>
          anonymous.get('/api/auth/convex/token')
        )
      )
      limited ||= responses.some((response) => response.status() === 429)
    }
    expect(limited).toBe(true)
    expect(
      (
        await anonymous.get('/api/auth/convex/token', {
          headers: { Cookie: 'better-auth.session_token=invalid-probe' },
        })
      ).status()
    ).toBe(403)
    expect((await page.request.get('/api/auth/convex/token')).status()).toBe(
      200
    )
    const actor = await client.query(api.auth.getCurrentUser, {})
    if (!actor) throw new Error('Missing quota fixture')
    holdAuthTokenBudget(actor.id)
    expect((await page.request.get('/api/auth/convex/token')).status()).toBe(
      429
    )
    expect((await page.request.get('/api/auth/get-session')).status()).toBe(200)
    await page.goto('/app')
    await expect(
      page.getByRole('button', { name: 'Réessayer', exact: true })
    ).toBeVisible()
    expect(await client.query(api.auth.getCurrentUser, {})).not.toBeNull()
    await expect(async () => {
      const retry = page.getByRole('button', { name: 'Réessayer', exact: true })
      if (await retry.isVisible()) await retry.click()
      await expect(
        page.getByRole('button', { name: 'Nouvelle ressource', exact: true })
      ).toBeEnabled({ timeout: 1500 })
    }).toPass({ timeout: 20_000, intervals: [1000, 2000] })
  } finally {
    await anonymous.dispose()
    await deleteAccountWithClient(client)
  }
})

test('une panne du renouvellement de token conserve le formulaire et propose de réessayer', async ({
  page,
}) => {
  // SSR supplies a valid JWT. Fail the real browser renewal that Convex
  // requests after confirming it, without jumping the client clock past a
  // still-in-flight token response from the server's real clock.
  await page.route('**/api/auth/convex/token', async (route) => {
    await route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{}',
    })
  })
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  try {
    await page
      .getByRole('button', { name: 'Nouvelle ressource', exact: true })
      .click()
    await page
      .getByLabel('Titre', { exact: true })
      .fill('Brouillon pendant une panne')
    await expect(
      page
        .getByRole('dialog')
        .getByRole('button', { name: 'Réessayer la connexion', exact: true })
    ).toBeVisible()
    await expect(page.getByLabel('Titre', { exact: true })).toHaveValue(
      'Brouillon pendant une panne'
    )
    expect(await client.query(api.auth.getCurrentUser, {})).not.toBeNull()
    await page.unroute('**/api/auth/convex/token')
    await page
      .getByRole('button', { name: 'Réessayer la connexion', exact: true })
      .click()
    await expect(
      page
        .getByRole('dialog')
        .getByRole('button', { name: 'Réessayer la connexion', exact: true })
    ).toHaveCount(0)
    await expect(page.getByLabel('Titre', { exact: true })).toHaveValue(
      'Brouillon pendant une panne'
    )
    await page
      .getByRole('button', { name: 'Créer la ressource', exact: true })
      .click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
  } finally {
    await deleteAccountWithClient(client)
  }
})

test('une connexion réussie remplace seulement la session présentée du même compte', async ({
  page,
  browser,
}) => {
  const email = createEmail()
  await signInWithEmail(page, email)
  const previous = await getAuthenticatedClient(page.context())
  const other = await browser.newContext({ baseURL: SITE_URL })
  const otherPage = await other.newPage()
  await signInWithEmail(otherPage, email)
  const otherClient = await getAuthenticatedClient(other)
  try {
    const code = await requestSignInCode(page.context(), email)
    const incorrect = code === '000000' ? '000001' : '000000'
    expect(
      (
        await page.request.post('/api/auth/sign-in/email-otp', {
          headers: { Origin: SITE_URL },
          data: { email, otp: incorrect },
        })
      ).status()
    ).toBe(400)
    expect(await previous.query(api.auth.getCurrentUser, {})).not.toBeNull()
    expect(
      (
        await page.request.post('/api/auth/sign-in/email-otp', {
          headers: { Origin: SITE_URL },
          data: { email, otp: code },
        })
      ).status()
    ).toBe(200)
    expect(await previous.query(api.auth.getCurrentUser, {})).toBeNull()
    expect(await otherClient.query(api.auth.getCurrentUser, {})).not.toBeNull()
    const current = await getAuthenticatedClient(page.context())
    expect(await current.query(api.auth.getCurrentUser, {})).not.toBeNull()
    const differentEmail = createEmail()
    const differentCode = await requestSignInCode(
      page.context(),
      differentEmail
    )
    expect(
      (
        await page.request.post('/api/auth/sign-in/email-otp', {
          headers: { Origin: SITE_URL },
          data: { email: differentEmail, otp: differentCode },
        })
      ).status()
    ).toBe(200)
    expect(await current.query(api.auth.getCurrentUser, {})).not.toBeNull()
    expect(await otherClient.query(api.auth.getCurrentUser, {})).not.toBeNull()
    const different = await getAuthenticatedClient(page.context())
    expect((await different.query(api.auth.getCurrentUser, {}))?.email).toBe(
      differentEmail
    )
    await deleteAccountWithClient(current)
    await deleteAccountWithClient(different)
  } finally {
    await other.close()
  }
})
