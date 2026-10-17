import { passkey } from '@better-auth/passkey'
import { convex } from '@convex-dev/better-auth/plugins'
import type { DBAdapterInstance } from 'better-auth'
import { APIError } from 'better-auth/api'
import type { BetterAuthOptions } from 'better-auth/minimal'
import { admin } from 'better-auth/plugins/admin'
import { emailOTP } from 'better-auth/plugins/email-otp'
import { magicLink } from 'better-auth/plugins/magic-link'
import { organization } from 'better-auth/plugins/organization'
import { twoFactor } from 'better-auth/plugins/two-factor'

import { appConfig } from '../shared/app-config'
import authConfig from './auth.config'

export type AuthSettings = {
  siteUrl: string
  secret: string
  passkeyRpId: string
}

type OtpDelivery = (message: { email: string; otp: string }) => Promise<void>
type MagicLinkDelivery = (message: {
  email: string
  url: string
}) => Promise<void>
type SocialCredentials = { clientId: string; clientSecret: string }
export type AuthModuleOptions = {
  adminIds: string[]
  google?: SocialCredentials
  github?: SocialCredentials
}

function requirePasskeyVerification(userVerified: boolean | undefined) {
  if (!userVerified) {
    throw new APIError('FORBIDDEN', {
      code: 'PASSKEY_USER_VERIFICATION_REQUIRED',
      message: 'Verify this passkey with a PIN or biometrics.',
    })
  }
}

// Used only by the schema generator and component table introspection.
// Runtime authentication always supplies validated deployment settings.
export const SCHEMA_AUTH_SETTINGS: AuthSettings = {
  siteUrl: 'http://localhost:3000',
  secret: 'schema-generation-only-not-a-runtime-secret',
  passkeyRpId: 'localhost',
}

export function buildAuthOptions(
  database: DBAdapterInstance,
  settings: AuthSettings,
  sendVerificationOTP: OtpDelivery,
  sendMagicLink: MagicLinkDelivery = () =>
    Promise.reject(new Error('Magic links are not configured.')),
  modules: AuthModuleOptions = { adminIds: [] }
) {
  return {
    appName: appConfig.name,
    baseURL: settings.siteUrl,
    secret: settings.secret,
    trustedOrigins: [settings.siteUrl],
    database,
    emailAndPassword: { enabled: false },
    account: { accountLinking: { enabled: false }, encryptOAuthTokens: true },
    socialProviders: {
      ...(modules.google ? { google: modules.google } : {}),
      ...(modules.github ? { github: modules.github } : {}),
    },
    user: {
      deleteUser: { enabled: false },
      changeEmail: { enabled: false },
      additionalFields: {
        profileVersion: {
          type: 'number',
          required: false,
          input: false,
          returned: false,
        },
        adminVersion: {
          type: 'number',
          required: false,
          input: false,
          returned: false,
        },
        nameKey: {
          type: 'string',
          required: false,
          input: false,
          returned: false,
        },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      // Sensitive operations use operation-bound proofs, including passkey registration.
      freshAge: 0,
      cookieCache: { enabled: false },
    },
    // Quotas run after live cookie validation in authHooks, with isolated
    // authenticated/anonymous identities and renewable per-operation budgets.
    // Retain the existing database table when generating the stable auth schema.
    rateLimit: {
      enabled: settings === SCHEMA_AUTH_SETTINGS,
      storage: 'database',
    },
    advanced: {
      // No trusted network perimeter is assumed, including direct Convex HTTP access.
      // Application quotas do not trust client-supplied forwarding headers.
      ipAddress: { ipAddressHeaders: [] },
      useSecureCookies: settings.siteUrl.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
    },
    plugins: [
      // Keep the optional module's schema stable in personal mode. Organization
      // endpoints are guarded in auth.ts; writes use atomic Convex operations.
      organization({ allowUserToCreateOrganization: false }),
      // Keep schemas stable; public endpoints are separately gated in auth.ts.
      magicLink({ sendMagicLink, expiresIn: 300, storeToken: 'hashed' }),
      twoFactor({ issuer: appConfig.name, allowPasswordless: true }),
      admin({
        defaultRole: 'user',
        adminUserIds: modules.adminIds,
        impersonationSessionDuration: 300,
      }),
      emailOTP({
        sendVerificationOTP,
        otpLength: 6,
        expiresIn: 300,
        allowedAttempts: 3,
        storeOTP: 'hashed',
        resendStrategy: 'rotate',
        rateLimit: { window: 60, max: 100 },
        changeEmail: { enabled: false },
      }),
      passkey({
        rpID: settings.passkeyRpId,
        rpName: appConfig.name,
        origin: settings.siteUrl,
        authenticatorSelection: { userVerification: 'required' },
        // Better Auth 1.6.22 does not require the signed UV flag by default.
        // These hooks run after cryptographic verification, before persisting
        // the credential or creating a session; client options alone cannot
        // enforce this policy against a direct API caller.
        registration: {
          afterVerification: ({ verification }) => {
            requirePasskeyVerification(
              verification.registrationInfo?.userVerified
            )
          },
        },
        authentication: {
          afterVerification: ({ verification }) => {
            requirePasskeyVerification(
              verification.authenticationInfo.userVerified
            )
          },
        },
      }),
      convex({ authConfig }),
    ],
  } satisfies BetterAuthOptions
}
