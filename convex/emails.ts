import { ConvexError, v } from 'convex/values'

import { appConfig } from '../shared/app-config'
import { emailSchema, otpSchema } from '../shared/validation'
import { internal } from './_generated/api'
import { internalAction, internalMutation } from './_generated/server'
import type { ActionCtx } from './_generated/server'
import { getEmailSettings } from './lib/emailEnvironment'
import { getAuthSettings } from './lib/environment'
import { limitAuthEmail, limitIdentityEmail } from './lib/rateLimits'

const REQUEST_TIMEOUT_MS = 10_000

async function deliverMessage(
  ctx: ActionCtx,
  email: string,
  subject: string,
  text: string
): Promise<void> {
  const settings = getEmailSettings()
  const provider = settings.AUTH_EMAIL_PROVIDER
  if (provider === 'smtp') {
    await ctx.runAction(internal.smtp.deliver, { email, subject, text })
    return
  }
  const from = settings.AUTH_EMAIL_FROM
  const payload =
    provider === 'mailpit'
      ? {
          From: { Email: from, Name: appConfig.name },
          To: [{ Email: email }],
          Subject: subject,
          Text: text,
        }
      : { from, to: [email], subject, text }
  const endpoint = getEmailEndpoint(settings)
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (provider === 'resend')
    headers.authorization = `Bearer ${settings.RESEND_API_KEY}`
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  // Never surface provider bodies: they can echo recipients, tokens or API keys.
  if (!response.ok)
    throw new Error(
      `Authentication email delivery failed (${response.status}).`
    )
}

function getEmailEndpoint(
  settings: ReturnType<typeof getEmailSettings>
): string {
  const provider = settings.AUTH_EMAIL_PROVIDER
  if (provider === 'resend') return 'https://api.resend.com/emails'
  if (provider !== 'mailpit')
    throw new Error('AUTH_EMAIL_PROVIDER must be mailpit or resend.')
  const siteUrl = new URL(getAuthSettings().siteUrl)
  if (!['localhost', '127.0.0.1'].includes(siteUrl.hostname)) {
    throw new Error(
      'Mailpit is restricted to local development; configure Resend for production.'
    )
  }
  const mailpit = new URL(settings.MAILPIT_URL ?? '')
  if (
    !['localhost', '127.0.0.1', 'mailpit', 'host.docker.internal'].includes(
      mailpit.hostname
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
  args: {
    email: v.string(),
    otp: v.string(),
    purpose: v.optional(
      v.union(
        v.literal('sign-in'),
        v.literal('email-verification'),
        v.literal('forget-password'),
        v.literal('change-email')
      )
    ),
  },
  returns: v.null(),
  handler: async (ctx, { email, otp, purpose }) => {
    const recipient = emailSchema.safeParse(email)
    const code = otpSchema.safeParse(otp)
    if (!recipient.success || !code.success)
      throw new ConvexError({ code: 'INVALID_INPUT' })
    await ctx.runMutation(internal.emails.consumeQuota, {
      email: recipient.data,
    })
    await deliverMessage(
      ctx,
      recipient.data,
      purpose === 'forget-password'
        ? 'Récupération de votre mot de passe'
        : purpose === 'email-verification'
          ? 'Vérifiez votre adresse email'
          : 'Votre code de connexion',
      `Votre code est ${code.data}. Il expire dans 5 minutes.\n\nSi vous n'avez pas demandé ce code, ignorez ce message.`
    )
    return null
  },
})

export const sendMagicLink = internalAction({
  args: { email: v.string(), url: v.string() },
  returns: v.null(),
  handler: async (ctx, { email, url }) => {
    const recipient = emailSchema.parse(email)
    if (url.length > 4096) throw new ConvexError({ code: 'INVALID_INPUT' })
    const link = new URL(url)
    if (
      link.origin !== getAuthSettings().siteUrl ||
      link.pathname !== '/api/auth/magic-link/verify'
    )
      throw new ConvexError({ code: 'INVALID_INPUT' })
    await ctx.runMutation(internal.emails.consumeQuota, { email: recipient })
    await deliverMessage(
      ctx,
      recipient,
      'Votre lien de connexion',
      `Connectez-vous en ouvrant ce lien à usage unique, valable 5 minutes :\n${url}\n\nIgnorez ce message si vous n'avez pas demandé cette connexion.`
    )
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

export const sendConfirmation = internalAction({
  args: { userId: v.string(), email: v.string(), otp: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const email = emailSchema.parse(args.email)
    const code = otpSchema.parse(args.otp)
    await ctx.runMutation(internal.emails.consumeIdentityQuota, {
      userId: args.userId,
    })
    await deliverMessage(
      ctx,
      email,
      'Confirmez votre identité',
      `Votre code de confirmation est ${code}. Il expire dans 5 minutes et autorise uniquement l’action demandée. Ne le partagez pas.`
    )
    return null
  },
})
export const consumeIdentityQuota = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId }) => {
    await limitIdentityEmail(ctx, userId)
    return null
  },
})
