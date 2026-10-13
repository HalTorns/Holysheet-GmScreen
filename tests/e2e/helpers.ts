import { randomUUID } from 'node:crypto'
import { expect } from '@playwright/test'
import { ConvexHttpClient } from 'convex/browser'
import { z } from 'zod'
import type { BrowserContext, Page } from '@playwright/test'

export const SITE_URL = 'http://localhost:3000'
const MAILPIT_URL = 'http://127.0.0.1:8025'
const CONVEX_URL = 'http://127.0.0.1:3210'

const mailboxSchema = z.object({
  messages: z.array(z.object({ ID: z.string() })),
})
const messageSchema = z.object({ Text: z.string() })
const tokenSchema = z.object({ token: z.string().min(1) })
const exportSchema = z.object({
  profile: z.object({ email: z.email() }),
  resources: z.array(z.object({ title: z.string() })),
  organizations: z.array(
    z.object({ id: z.string(), name: z.string(), role: z.string() }),
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

async function readMailbox(email: string): Promise<string[]> {
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
  const code = message.Text.match(/\b\d{6}\b/)?.[0]
  if (!code)
    throw new Error('Le message ne contient pas de code de vérification.')
  return code
}

async function waitForVerificationCode(
  email: string,
  previousMessages: Set<string>,
): Promise<string> {
  let messageId: string | undefined
  await expect
    .poll(
      async () => {
        messageId = (await readMailbox(email)).find(
          (id) => !previousMessages.has(id),
        )
        return Boolean(messageId)
      },
      { message: 'Un nouvel email de connexion doit arriver dans Mailpit.' },
    )
    .toBe(true)
  if (!messageId) throw new Error('Le nouvel email de connexion est absent.')
  return readVerificationCode(messageId)
}

export async function requestSignInCode(
  context: BrowserContext,
  email: string,
): Promise<string> {
  const previousMessages = new Set(await readMailbox(email))
  const response = await context.request.post(
    '/api/auth/email-otp/send-verification-otp',
    {
      headers: { Origin: SITE_URL },
      data: { email, type: 'sign-in' },
    },
  )
  expect(response.status()).toBe(200)
  return waitForVerificationCode(email, previousMessages)
}

export async function signInWithEmail(
  page: Page,
  email: string,
): Promise<void> {
  const previousMessages = new Set(await readMailbox(email))
  await page.goto('/sign-in')
  await page.getByLabel('Adresse e-mail', { exact: true }).fill(email)
  const [sent] = await Promise.all([
    page.waitForResponse(
      (response) =>
        new URL(response.url()).pathname ===
          '/api/auth/email-otp/send-verification-otp' &&
        response.request().method() === 'POST',
    ),
    page.getByRole('button', { name: 'Recevoir un code', exact: true }).click(),
  ])
  if (!sent.ok()) {
    const body: unknown = await sent.json().catch(() => null)
    const parsed = publicAuthErrorSchema.safeParse(body)
    throw new Error(
      `L’envoi du code a échoué (HTTP ${sent.status()}, code ${parsed.success ? parsed.data.code : 'UNKNOWN'}).`,
    )
  }
  const codeField = page.getByLabel('Code de vérification', { exact: true })
  await expect(codeField).toBeVisible()
  await codeField.fill(await waitForVerificationCode(email, previousMessages))
  await page.getByRole('button', { name: 'Se connecter', exact: true }).click()
  await expect(page).toHaveURL(`${SITE_URL}/app`)
  await expect(
    page.getByRole('button', { name: 'Nouvelle ressource', exact: true }),
  ).toBeEnabled()
}

export async function getAuthenticatedClient(context: BrowserContext) {
  const response = await context.request.get(
    `${SITE_URL}/api/auth/convex/token`,
  )
  if (!response.ok())
    throw new Error(
      `Le token Convex ne peut pas être obtenu (HTTP ${response.status()}).`,
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
    },
  )
  return { cdp, authenticatorId: String(authenticatorId) }
}

export async function addPasskey(page: Page, name: string): Promise<void> {
  await page
    .getByRole('button', { name: 'Ajouter une passkey', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByLabel('Nom de la passkey', { exact: true }).fill(name)
  await page
    .getByRole('button', { name: 'Enregistrer la passkey', exact: true })
    .click()
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
      JSON.parse(Buffer.concat(chunks).toString('utf8')),
    )
  } finally {
    await download.delete()
  }
}

export async function deleteAccount(page: Page): Promise<void> {
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
  await expect(page).toHaveURL(`${SITE_URL}/`)
}
