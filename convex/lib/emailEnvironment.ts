import { createEnv } from '@t3-oss/env-core'

import { optionalSecret, invalidEnvironment } from '../../shared/environment'
import { emailSchema } from '../../shared/validation'
import { z } from '../../shared/zod'

export function getEmailSettings() {
  const env = createEnv({
    server: {
      AUTH_EMAIL_PROVIDER: z.enum(['mailpit', 'resend']),
      AUTH_EMAIL_FROM: emailSchema,
      RESEND_API_KEY: optionalSecret,
      MAILPIT_URL: z.url().optional(),
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
  return env
}
