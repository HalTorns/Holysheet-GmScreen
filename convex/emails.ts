import { ConvexError, v } from 'convex/values'
import { internal } from './_generated/api'
import { internalAction, internalMutation } from './_generated/server'
import { emailSchema, otpSchema } from '../shared/validation'
import { appConfig } from '../shared/app-config'
import { getAuthSettings, requiredEnvironment } from './lib/environment'
import { limitAuthEmail } from './lib/rateLimits'

const REQUEST_TIMEOUT_MS = 10_000

async function deliverOtp(email: string, otp: string): Promise<void> {
  const provider = requiredEnvironment('AUTH_EMAIL_PROVIDER')
  const from = emailSchema.parse(requiredEnvironment('AUTH_EMAIL_FROM'))
  const subject = 'Votre code de connexion'
  const text = `Votre code de connexion est ${otp}. Il expire dans 5 minutes.\n\nSi vous n'avez pas demandé ce code, ignorez ce message.`
  const payload =
    provider === 'mailpit'
      ? {
          From: { Email: from, Name: appConfig.name },
          To: [{ Email: email }],
          Subject: subject,
          Text: text,
        }
      : { from, to: [email], subject, text }
  const endpoint = getEmailEndpoint(provider)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (provider === 'resend')
    headers.authorization = `Bearer ${requiredEnvironment('RESEND_API_KEY')}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  // Never surface provider bodies: they can echo recipients, tokens or API keys.
  if (!response.ok)
    throw new Error(
      `Authentication email delivery failed (${response.status}).`,
    )
}

function getEmailEndpoint(provider: string): string {
  if (provider === 'resend') return 'https://api.resend.com/emails'
  if (provider !== 'mailpit')
    throw new Error('AUTH_EMAIL_PROVIDER must be mailpit or resend.')
  const siteUrl = new URL(getAuthSettings().siteUrl)
  if (!['localhost', '127.0.0.1'].includes(siteUrl.hostname)) {
    throw new Error(
      'Mailpit is restricted to local development; configure Resend for production.',
    )
  }
  const mailpit = new URL(requiredEnvironment('MAILPIT_URL'))
  if (
    !['localhost', '127.0.0.1', 'mailpit', 'host.docker.internal'].includes(
      mailpit.hostname,
    )
  ) {
    throw new Error('MAILPIT_URL must point to a local Mailpit service.')
  }
  if (
    !['http:', 'https:'].includes(mailpit.protocol) ||
    mailpit.username ||
    mailpit.password
  ) {
    throw new Error('MAILPIT_URL must use HTTP(S) without URL credentials.')
  }
  return new URL('/api/v1/send', mailpit).toString()
}

export const sendOtp = internalAction({
  args: { email: v.string(), otp: v.string() },
  returns: v.null(),
  handler: async (ctx, { email, otp }) => {
    const recipient = emailSchema.safeParse(email)
    const code = otpSchema.safeParse(otp)
    if (!recipient.success || !code.success)
      throw new ConvexError({ code: 'INVALID_INPUT' })
    await ctx.runMutation(internal.emails.consumeQuota, {
      email: recipient.data,
    })
    await deliverOtp(recipient.data, code.data)
    return null
  },
})

export const consumeQuota = internalMutation({
  args: { email: v.string() },
  returns: v.null(),
  handler: async (ctx, { email }) => {
    await limitAuthEmail(ctx, emailSchema.parse(email))
    return null
  },
})
