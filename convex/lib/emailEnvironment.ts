import { createEnv } from '@t3-oss/env-core'

import { optionalSecret, invalidEnvironment } from '../../shared/environment'
import { emailSchema } from '../../shared/validation'
import { z } from '../../shared/zod'

export function getEmailSettings() {
  const env = createEnv({
    server: {
      AUTH_EMAIL_PROVIDER: z.enum(['mailpit', 'resend', 'smtp']),
      AUTH_EMAIL_FROM: emailSchema,
      RESEND_API_KEY: optionalSecret,
      MAILPIT_URL: z.url().optional(),
      SMTP_HOST: z.string().optional(),
      SMTP_PORT: z.coerce.number().int().min(1).max(65_535).optional(),
      SMTP_SECURITY: z.enum(['tls', 'starttls']).optional(),
      SMTP_USER: z.string().optional(),
      SMTP_PASSWORD: z.string().optional(),
      SMTP_EHLO_NAME: z.string().optional(),
    },
    runtimeEnv: process.env,
    isServer: true,
    emptyStringAsUndefined: true,
    onValidationError: invalidEnvironment,
  })
  if (env.AUTH_EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY)
    invalidEnvironment()
  if (env.AUTH_EMAIL_PROVIDER === 'mailpit' && !env.MAILPIT_URL)
    invalidEnvironment()
  if (env.AUTH_EMAIL_PROVIDER === 'smtp') getSmtpSettings(env)
  return env
}

export function getSmtpSettings(environment: Record<string, unknown>) {
  const hostname = z
    .string()
    .min(1)
    .max(253)
    .regex(/^[a-zA-Z0-9.-]+$/)
  const parsed = z
    .object({
      SMTP_HOST: hostname,
      SMTP_PORT: z.number().int().min(1).max(65_535),
      SMTP_SECURITY: z.enum(['tls', 'starttls']),
      SMTP_USER: z.string().min(1).max(254),
      SMTP_PASSWORD: z.string().min(1),
      SMTP_EHLO_NAME: hostname.optional(),
    })
    .safeParse(environment)
  if (!parsed.success) invalidEnvironment()
  return parsed.data
}
