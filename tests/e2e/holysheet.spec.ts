import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'

import { api } from '../../convex/_generated/api'
import { gmTables } from '../../shared/gm'
import { verifyLocalRestore } from './backup'
import {
  completeProfile,
  createEmail,
  deleteAccountWithClient,
  getAuthenticatedClient,
  readMailbox,
  waitForVerificationCode,
  getAnonymousClient,
} from './helpers'
import { verifyLibrary } from './library'
import { verifyScreenEditor } from './screen-editor'
import { verifyVariables } from './variables'
import { verifyWidgetTools } from './widget-tools'

test('password registration, project, folder and Screen survive reload, synchronize and restore', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000)
  const email = createEmail()
  const password = `Synthetic-${randomUUID()}`
  let client: Awaited<ReturnType<typeof getAuthenticatedClient>> | undefined
  const secondPage = await context.newPage()
  try {
    await page.goto('/')
    await expect(
      page.getByRole('heading', { name: 'Retrouvez votre table.' })
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Créer un compte', exact: true })
      .click()
    await page
      .getByLabel('Pseudo', { exact: true })
      .fill(`MJ ${randomUUID().slice(0, 8)}`)
    await page.getByLabel('Adresse email', { exact: true }).fill(email)
    await page.getByLabel('Mot de passe', { exact: true }).fill(password)
    const previous = new Set(await readMailbox(email))
    const [registration] = await Promise.all([
      page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname === '/api/auth/sign-up/email'
      ),
      page
        .getByRole('button', { name: 'Créer mon compte', exact: true })
        .click(),
    ])
    expect(
      registration.status(),
      'Credential registration should succeed'
    ).toBe(200)
    await expect(
      page.getByLabel('Code de vérification', { exact: true })
    ).toBeVisible()
    await page
      .getByLabel('Code de vérification', { exact: true })
      .fill(await waitForVerificationCode(email, previous))
    await page
      .getByRole('button', { name: 'Vérifier mon adresse', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Retrouvez votre table.' })
    ).toBeVisible()
    expect(
      (await context.cookies()).some((cookie) =>
        cookie.name.includes('session_token')
      )
    ).toBe(false)
    await page.getByLabel('Mot de passe', { exact: true }).fill(password)
    await page
      .getByRole('button', { name: 'Se connecter', exact: true })
      .click()
    await expect(page).toHaveURL(/\/app$/)
    await completeProfile(page)
    await expect(
      page.getByRole('heading', { name: 'Mes projets.' })
    ).toBeVisible()
    client = await getAuthenticatedClient(context)
    await page
      .getByRole('textbox', { name: 'Créer un projet', exact: true })
      .fill('Campagne des brumes')
    await page
      .getByRole('button', { name: 'Créer un projet', exact: true })
      .click()
    await page.getByRole('link', { name: /Campagne des brumes/ }).click()
    await page
      .getByRole('textbox', { name: 'Créer un dossier', exact: true })
      .fill('Session 1')
    await page
      .getByRole('button', { name: 'Créer un dossier', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'Dossier · Session 1', exact: true })
      .click()
    await page
      .getByLabel('Format initial du Screen')
      .selectOption('a4-landscape')
    await page
      .getByRole('textbox', { name: 'Créer un Screen', exact: true })
      .fill('Références de session')
    await page
      .getByRole('button', { name: 'Créer un Screen', exact: true })
      .click()
    await page
      .getByRole('link', { name: 'Références de session →', exact: true })
      .click()
    await page
      .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
      .uncheck()
    await page
      .getByRole('button', { name: 'Ajouter une note', exact: true })
      .click()
    await page
      .getByRole('textbox', { name: 'Contenu de la note' })
      .fill('Le marchand ferme au crépuscule.')
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Enregistrer', exact: true })
    ).toBeDisabled()
    await expect(page.getByText('Enregistré', { exact: true })).toBeVisible()
    await page.reload()
    await page
      .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
      .uncheck()
    await expect(
      page.getByRole('textbox', { name: 'Contenu de la note' })
    ).toHaveValue('Le marchand ferme au crépuscule.')
    await secondPage.goto(page.url())
    await secondPage
      .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
      .uncheck()
    await expect(
      secondPage.getByRole('textbox', { name: 'Contenu de la note' })
    ).toHaveValue('Le marchand ferme au crépuscule.')
    await secondPage
      .getByRole('textbox', { name: 'Contenu de la note' })
      .fill('Les portes ferment à la nuit.')
    await secondPage
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click()
    await expect(
      page.getByRole('textbox', { name: 'Contenu de la note' })
    ).toHaveValue('Les portes ferment à la nuit.')
    await page
      .getByRole('textbox', { name: 'Contenu de la note' })
      .fill('Brouillon local conservé')
    await secondPage
      .getByRole('textbox', { name: 'Contenu de la note' })
      .fill('Nouvelle version distante')
    await secondPage
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click()
    await expect(
      page.getByText(
        'Cette note a changé dans une autre vue. Votre brouillon est conservé.'
      )
    ).toBeVisible()
    await expect(
      page.getByRole('textbox', { name: 'Contenu de la note' })
    ).toHaveValue('Brouillon local conservé')
    await page
      .getByRole('button', { name: 'Charger la version enregistrée' })
      .click()
    await expect(
      page.getByRole('textbox', { name: 'Contenu de la note' })
    ).toHaveValue('Nouvelle version distante')
    await verifyScreenEditor(page, secondPage, client)
    await verifyWidgetTools(page, client)
    await verifyLibrary(page, client)
    await verifyVariables(page, client)
    const report = await verifyLocalRestore()
    for (const table of gmTables)
      expect(report.tables[table]).toBeGreaterThan(0)
    await page.goto('/app/security')
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Exporter mes données' }).click(),
    ])
    expect(download.suggestedFilename()).toMatch(/^holysheet-export-/)
    await page.goto('/sign-in')
    await page
      .getByRole('button', { name: 'Mot de passe oublié', exact: true })
      .click()
    await page.getByLabel('Adresse email', { exact: true }).fill(email)
    const recoveryMailbox = new Set(await readMailbox(email))
    await page
      .getByRole('button', {
        name: 'Recevoir un code de récupération',
        exact: true,
      })
      .click()
    await page
      .getByLabel('Code de vérification', { exact: true })
      .fill(await waitForVerificationCode(email, recoveryMailbox))
    const nextPassword = `Synthetic-${randomUUID()}`
    await page
      .getByLabel('Nouveau mot de passe', { exact: true })
      .fill(nextPassword)
    await page
      .getByRole('button', {
        name: 'Enregistrer le nouveau mot de passe',
        exact: true,
      })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Retrouvez votre table.' })
    ).toBeVisible()
    await expect(client.query(api.auth.getCurrentUser, {})).resolves.toBeNull()
    await page.getByLabel('Mot de passe', { exact: true }).fill(nextPassword)
    await page
      .getByRole('button', { name: 'Se connecter', exact: true })
      .click()
    await expect(page).toHaveURL(/\/app$/)
    client = await getAuthenticatedClient(context)
    await expect(
      page.getByRole('link', { name: /Campagne des brumes/ })
    ).toBeVisible()
  } finally {
    await secondPage.close()
    if (client) await deleteAccountWithClient(client)
  }
})

test('password-only policy refuses OTP and passkey login through the real HTTP API', async ({
  request,
}) => {
  for (const [path, data] of [
    ['/sign-in/email-otp', { email: createEmail(), otp: '000000' }],
    [
      '/email-otp/send-verification-otp',
      { email: createEmail(), type: 'sign-in' },
    ],
    ['/passkey/generate-authenticate-options', {}],
  ] as const) {
    const response = path.startsWith('/passkey/')
      ? await request.get(`/api/auth${path}`)
      : await request.post(`/api/auth${path}`, {
          headers: { Origin: test.info().project.use.baseURL ?? '' },
          data,
        })
    expect(response.status()).toBe(403)
  }
})

test('private pages enforce authentication, no-store responses and origin checks', async ({
  page,
  request,
}) => {
  await page.goto('/app')
  await expect(page).toHaveURL(/\/sign-in$/)
  await expect(
    getAnonymousClient().query(api.gm.listProjects, {
      paginationOpts: { numItems: 1, cursor: null },
    })
  ).rejects.toThrow()
  const response = await request.get('/sign-in')
  expect(response.headers()['cache-control']).toBe('private, no-store')
  expect(response.headers()['x-content-type-options']).toBe('nosniff')
  expect(response.headers()['x-frame-options']).toBe('DENY')
  const forbidden = await request.post('/api/auth/sign-out', {
    headers: {
      Origin: 'https://untrusted.example',
      Cookie: 'better-auth.session_token=invalid-probe',
    },
    data: {},
  })
  expect(forbidden.status()).toBe(403)
})

test('production CSP permits only its nonce and rejects injected scripts', async ({
  page,
  request,
}) => {
  test.skip(
    !process.env.CI && !process.env.PLAYWRIGHT_PRODUCTION,
    'Requires the built server.'
  )
  const first = await request.get('/sign-in')
  const second = await request.get('/sign-in')
  const firstPolicy = first.headers()['content-security-policy'] ?? ''
  const nonce = /'nonce-([^']+)'/.exec(firstPolicy)?.[1]
  expect(Boolean(nonce)).toBe(true)
  expect(firstPolicy).not.toBe(second.headers()['content-security-policy'])
  const scriptPolicy = firstPolicy
    .split(';')
    .find((directive) => directive.trim().startsWith('script-src '))
  expect(scriptPolicy).not.toContain("'unsafe-inline'")
  expect(scriptPolicy).not.toContain("'unsafe-eval'")
  await page.route('**/sign-in', async (route) => {
    const response = await route.fetch()
    const html = await response.text()
    await route.fulfill({
      response,
      body: html.replace(
        '</body>',
        '<script>document.documentElement.dataset.injectionExecuted="yes"</script></body>'
      ),
    })
  })
  await page.goto('/sign-in')
  await expect(page.getByLabel('Adresse email', { exact: true })).toBeEditable()
  expect(
    await page.evaluate(
      () => document.documentElement.dataset.injectionExecuted
    )
  ).toBeUndefined()
})
