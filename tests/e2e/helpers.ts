import { randomUUID } from 'node:crypto'

import { expect } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { z } from 'zod'

import { api } from '../../convex/_generated/api'
import { siteUrl, mailpitUrl, backendUrl } from '../../scripts/local-config.mjs'

export const SITE_URL = process.env.PLAYWRIGHT_BASE_URL ?? siteUrl
const MAILPIT_URL = mailpitUrl
const CONVEX_URL = backendUrl

const mailboxSchema = z.object({
  messages: z.array(z.object({ ID: z.string() })),
})
const messageSchema = z.object({ Text: z.string() })
const tokenSchema = z.object({ token: z.string().min(1) })
const exportSchema = z.object({
  profile: z.object({ email: z.email() }),
  resources: z.array(z.object({ title: z.string() })),
  organizations: z.array(
    z.object({ id: z.string(), name: z.string(), role: z.string() })
  ),
})
const publicAuthErrorSchema = z.object({
  code: z.enum([
    'TOO_MANY_REQUESTS',
    'RATE_LIMITED',
    'INTERNAL_SERVER_ERROR',
    'INVALID_EMAIL',
    'ERROR_SENDING_VERIFICATION_EMAIL',
    'INVALID_ORIGIN',
    'MISSING_OR_NULL_ORIGIN',
    'OTP_EXPIRED',
    'INVALID_OTP',
    'TOO_MANY_ATTEMPTS',
  ]),
})

export function createEmail(): string {
  return `e2e-${randomUUID()}@example.test`
}

export async function readMailbox(email: string): Promise<string[]> {
  const query = new URLSearchParams({ query: `to:${email}`, limit: '10' })
  const response = await fetch(`${MAILPIT_URL}/api/v1/search?${query}`)
  if (!response.ok) throw new Error('La boîte Mailpit est inaccessible.')
  const mailbox = mailboxSchema.parse(await response.json())
  return mailbox.messages.map((message) => message.ID)
}

async function readVerificationCode(messageId: string): Promise<string> {
  const response = await fetch(`${MAILPIT_URL}/api/v1/message/${messageId}`)
  if (!response.ok) throw new Error('Le message Mailpit est inaccessible.')
  const message = messageSchema.parse(await response.json())
  const code = /\b\d{6}\b/.exec(message.Text)?.[0]
  if (!code)
    throw new Error('Le message ne contient pas de code de vérification.')
  return code
}

export async function waitForVerificationCode(
  email: string,
  previousMessages: Set<string>
): Promise<string> {
  let messageId: string | undefined
  await expect
    .poll(
      async () => {
        messageId = (await readMailbox(email)).find(
          (id) => !previousMessages.has(id)
        )
        return Boolean(messageId)
      },
      { message: 'Un nouvel email de connexion doit arriver dans Mailpit.' }
    )
    .toBe(true)
  if (!messageId) throw new Error('Le nouvel email de connexion est absent.')
  return await readVerificationCode(messageId)
}

export async function requestSignInCode(
  context: BrowserContext,
  email: string
): Promise<string> {
  const previousMessages = new Set(await readMailbox(email))
  const response = await context.request.post(
    '/api/auth/email-otp/send-verification-otp',
    {
      headers: { Origin: SITE_URL },
      data: { email, type: 'sign-in' },
    }
  )
  expect(response.status()).toBe(200)
  return await waitForVerificationCode(email, previousMessages)
}

export async function signInWithEmail(
  page: Page,
  email: string
): Promise<void> {
  const previousMessages = new Set(await readMailbox(email))
  await page.goto('/sign-in')
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(email)
  const [sent] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          '/api/auth/email-otp/send-verification-otp' &&
        response.request().method() === 'POST'
    ),
    page.getByRole('button', { name: 'Recevoir un code', exact: true }).click(),
  ])
  if (!sent.ok()) {
    const body: unknown = await sent.json().catch(() => null)
    const parsed = publicAuthErrorSchema.safeParse(body)
    throw new Error(
      `L’envoi du code a échoué (HTTP ${sent.status()}, code ${parsed.success ? parsed.data.code : 'UNKNOWN'}).`
    )
  }
  const codeField = page.getByLabel('Code de vérification', { exact: true })
  await expect(codeField).toBeVisible()
  await codeField.fill(await waitForVerificationCode(email, previousMessages))
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page).toHaveURL(`${SITE_URL}/app`)
  await completeProfile(page)
  await expect(
    page.getByRole('button', { name: 'Nouvelle ressource', exact: true })
  ).toBeEnabled()
}

export async function getAuthenticatedClient(context: BrowserContext) {
  const response = await context.request.get(
    `${SITE_URL}/api/auth/convex/token`
  )
  if (!response.ok())
    throw new Error(
      `Le token Convex ne peut pas être obtenu (HTTP ${response.status()}).`
    )
  const result = tokenSchema.parse(await response.json())
  const client = new ConvexHttpClient(CONVEX_URL)
  client.setAuth(result.token)
  return client
}

export function getAnonymousClient(): ConvexHttpClient {
  return new ConvexHttpClient(CONVEX_URL)
}

export async function createResource(page: Page, title: string): Promise<void> {
  await page
    .getByRole('button', { name: 'Nouvelle ressource', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('Titre', { exact: true }).fill(title)
  await page
    .getByLabel('Description (facultatif)', { exact: true })
    .fill('Créée depuis le navigateur E2E.')
  await page
    .getByRole('button', { name: 'Créer la ressource', exact: true })
    .click()
  await expect(page.getByText(title, { exact: true })).toBeVisible()
}

export async function installAuthenticator(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send(
    'WebAuthn.addVirtualAuthenticator',
    {
      options: {
        protocol: 'ctap2',
        transport: 'internal',
        hasResidentKey: true,
        hasUserVerification: true,
        isUserVerified: true,
        automaticPresenceSimulation: true,
      },
    }
  )
  return { cdp, authenticatorId }
}

export async function addPasskey(page: Page, name: string): Promise<void> {
  const mailbox = await identityMailbox(page)
  await page
    .getByRole('button', { name: 'Ajouter une passkey', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('Nom de la passkey', { exact: true }).fill(name)
  await page
    .getByRole('button', { name: 'Enregistrer la passkey', exact: true })
    .click()
  await finishIdentityConfirmation(page, mailbox)
  await expect(page.getByText(name, { exact: true })).toBeVisible()
}

export async function exportAccountData(page: Page) {
  const downloaded = page.waitForEvent('download')
  await page
    .getByRole('button', { name: 'Exporter mes données', exact: true })
    .click()
  const download = await downloaded
  try {
    const stream = await download.createReadStream()
    if (!stream) throw new Error('Le téléchargement de données est absent.')
    const source: AsyncIterable<unknown> = stream
    const chunks: Uint8Array[] = []
    for await (const chunk of source) {
      if (!(chunk instanceof Uint8Array))
        throw new Error('Le téléchargement contient un bloc inattendu.')
      chunks.push(chunk)
    }
    return exportSchema.parse(
      JSON.parse(Buffer.concat(chunks).toString('utf-8'))
    )
  } finally {
    await download.delete()
  }
}

export async function deleteAccount(page: Page): Promise<void> {
  const mailbox = await identityMailbox(page)
  await page.goto('/app/security')
  await page
    .getByRole('button', { name: 'Supprimer mon compte', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page
    .getByLabel('Saisissez SUPPRIMER pour confirmer', { exact: true })
    .fill('SUPPRIMER')
  await page
    .getByRole('button', {
      name: 'Supprimer définitivement mon compte',
      exact: true,
    })
    .click()
  await finishIdentityConfirmation(page, mailbox)
  await expect(page).toHaveURL(`${SITE_URL}/`)
}

export async function completeProfile(page: Page) {
  const client = await getAuthenticatedClient(page.context())
  if (!(await client.query(api.auth.getCurrentUser, {}))?.requiresName) return
  await expect(
    page.getByRole('heading', { name: 'Comment doit-on vous appeler ?' })
  ).toBeVisible()
  await page
    .getByLabel('Pseudo', { exact: true })
    .fill(`Test-${randomUUID().slice(0, 16)}`)
  await page.getByRole('button', { name: 'Continuer', exact: true }).click()
  try {
    await expect(
      page.getByRole('heading', { name: 'Comment doit-on vous appeler ?' })
    ).toHaveCount(0)
  } catch {
    const messages = await page
      .locator('[role=alert], .field-error')
      .allTextContents()
    throw new Error(
      `Le choix du pseudo n’a pas abouti : ${messages.join(' | ') || 'aucune erreur affichée'}`
    )
  }
}
export async function identityMailbox(page: Page) {
  const client = await getAuthenticatedClient(page.context())
  const user = await client.query(api.auth.getCurrentUser, {})
  if (!user) throw new Error('Missing authenticated fixture')
  return { email: user.email, previous: new Set(await readMailbox(user.email)) }
}
export async function finishIdentityConfirmation(
  page: Page,
  mailbox: { email: string; previous: Set<string> }
) {
  const code = await waitForVerificationCode(mailbox.email, mailbox.previous)
  await page
    .getByLabel('Code de confirmation d’identité', { exact: true })
    .fill(code)
  await page
    .getByRole('button', { name: 'Confirmer et continuer', exact: true })
    .click()
  await expect(
    page.getByRole('heading', { name: 'Confirmer votre identité', exact: true })
  ).toHaveCount(0)
}
async function confirmClient(client: ConvexHttpClient, operation: string) {
  const user = await client.query(api.auth.getCurrentUser, {})
  if (!user) throw new Error('Missing authenticated fixture')
  const previous = new Set(await readMailbox(user.email))
  await client.action(api.identityConfirmation.request, { operation })
  const code = await waitForVerificationCode(user.email, previous)
  if (
    !(await client.action(api.identityConfirmation.verify, { operation, code }))
  )
    throw new Error('Identity confirmation failed')
}
export async function deleteAccountWithClient(client: ConvexHttpClient) {
  await confirmClient(client, 'account.delete')
  await client.mutation(api.account.deleteAccount, { confirmation: 'DELETE' })
}

export async function deleteOrganizationWithClient(
  client: ConvexHttpClient,
  organizationId: string
) {
  await confirmClient(client, `organization.delete:${organizationId}`)
  await client.mutation(api.organizations.remove, {
    organizationId,
    confirmation: 'DELETE',
  })
}
