import type { GenericCtx } from '@convex-dev/better-auth'
import { requireActionCtx } from '@convex-dev/better-auth/utils'
import {
  APIError,
  createAuthMiddleware,
  getSession,
  isAPIError,
} from 'better-auth/api'
import { getSessionCookie } from 'better-auth/cookies'

import { RECENT_AUTH_MAX_AGE_SECONDS } from '../../shared/validation'
import { z } from '../../shared/zod'
import { components, internal } from '../_generated/api'
import type { DataModel } from '../_generated/dataModel'
import { getAuthModules } from './authModules'
import { getSessionAccess } from './sessionAccess'

export function isSignInPath(path: string) {
  return (
    [
      '/sign-in/email-otp',
      '/passkey/verify-authentication',
      '/magic-link/verify',
    ].includes(path) || path.startsWith('/callback/')
  )
}
const sensitivePaths: Record<string, string> = {
  '/passkey/verify-registration': 'passkey.add',
  '/two-factor/enable': 'mfa.enable',
  '/two-factor/disable': 'mfa.disable',
  '/two-factor/get-totp-uri': 'mfa.uri',
  '/two-factor/generate-backup-codes': 'mfa.backup-codes',
}
const verificationPaths = new Set([
  '/two-factor/verify-totp',
  '/two-factor/verify-backup-code',
])
const managingFactorPaths = new Set([
  '/two-factor/enable',
  '/two-factor/disable',
  '/two-factor/get-totp-uri',
  '/two-factor/generate-backup-codes',
])
const pendingSessionPaths = new Set([
  '/get-session',
  '/convex/token',
  '/sign-out',
  '/pending-sign-in/cancel',
  ...verificationPaths,
])
const resultUser = z.object({ user: z.object({ id: z.string() }) }).loose()
const passkeyAuthenticationOptions = z
  .object({ challenge: z.string(), rpId: z.string() })
  .loose()

function forbidden(code = 'FORBIDDEN'): never {
  throw new APIError('FORBIDDEN', {
    code,
    message: 'This operation is not authorized.',
  })
}

export function authHooks(ctx: GenericCtx<DataModel>) {
  return {
    before: createAuthMiddleware(async (request) => {
      const path = request.path ?? ''
      // Profile writes have one atomic owner, including calls made outside our UI.
      if (
        path === '/update-user' &&
        request.body &&
        ('name' in request.body ||
          'nameKey' in request.body ||
          'profileVersion' in request.body ||
          'adminVersion' in request.body ||
          'role' in request.body)
      )
        forbidden('PROFILE_UPDATE_FORBIDDEN')
      if (
        path.startsWith('/organization/') ||
        path === '/passkey/delete-passkey'
      )
        forbidden()
      if (
        [
          '/get-access-token',
          '/refresh-token',
          '/link-social',
          '/unlink-account',
        ].includes(path)
      )
        forbidden()
      if (path === '/convex/jwks') return
      // Convex's Bearer plugin runs after these guards and can change identity.
      // This HTTP surface uses cookies; Convex JWTs go directly to Convex APIs.
      if (
        request.headers?.has('authorization') ||
        request.request?.headers.has('authorization')
      )
        forbidden()
      if (
        path.startsWith('/two-factor/') &&
        !verificationPaths.has(path) &&
        !managingFactorPaths.has(path)
      )
        forbidden()
      const modules = getAuthModules()
      if (modules.AUTH_PROXY_REQUIRED) {
        const provided = request.headers?.get('x-starter-auth-proxy') ?? ''
        const hash = async (value: string) =>
          new Uint8Array(
            await crypto.subtle.digest(
              'SHA-256',
              new TextEncoder().encode(value)
            )
          )
        const [actual, expected] = await Promise.all([
          hash(provided),
          hash(modules.AUTH_PROXY_SECRET ?? ''),
        ])
        let difference = 0
        for (let index = 0; index < actual.length; index += 1)
          difference |= (actual[index] ?? 0) ^ (expected[index] ?? 0)
        if (difference !== 0) forbidden()
      }
      if (
        (path === '/sign-in/magic-link' || path === '/magic-link/verify') &&
        !modules.AUTH_MAGIC_LINK_ENABLED
      )
        forbidden('MODULE_DISABLED')
      if (
        path.startsWith('/admin/') &&
        path !== '/admin/stop-impersonating' &&
        (!modules.AUTH_ADMIN_ENABLED || path !== '/admin/impersonate-user')
      )
        forbidden('MODULE_DISABLED')
      // getSessionFromCtx swallows storage failures as null. Preserve failures
      // as 5xx, and validate revocation before allowing any sliding refresh.
      const readSession = async (disableRefresh: boolean) => {
        const live = await getSession()({
          context: request.context,
          method: 'GET',
          headers: request.headers ?? new Headers(),
          asResponse: false,
          returnHeaders: true,
          returnStatus: false,
          query: { disableCookieCache: true, disableRefresh },
        })
        for (const [key, value] of live.headers) {
          if (!request.context.responseHeaders)
            request.context.responseHeaders = new Headers()
          if (key.toLowerCase() === 'set-cookie')
            request.context.responseHeaders.append(key, value)
          else request.context.responseHeaders.set(key, value)
        }
        request.context.session = live.response
        if (!disableRefresh)
          Object.assign(request.context, {
            refreshedSessionCookies: live.headers.getSetCookie(),
          })
        return live.response
      }
      const session = await readSession(true)
      const access = session
        ? await getSessionAccess(ctx, session.session.id, session.user.id)
        : null
      if (
        (path === '/get-session' || path === '/convex/token') &&
        !access &&
        getSessionCookie(request.headers ?? new Headers())
      )
        forbidden('UNAUTHENTICATED')
      const action = requireActionCtx(ctx)
      const bucket =
        path === '/get-session'
          ? 'authSessionRead'
          : path === '/convex/token'
            ? 'authTokenRead'
            : isSignInPath(path) || path.startsWith('/email-otp/')
              ? 'authEntry'
              : 'authOther'
      try {
        await action.runMutation(internal.authSecurity.consumeAuthBudget, {
          bucket,
          key: access && session ? `user:${session.user.id}` : 'anonymous',
        })
      } catch {
        throw new APIError('TOO_MANY_REQUESTS', {
          code: 'RATE_LIMITED',
          message: 'Please retry shortly.',
        })
      }
      // Token renewals reuse context.session in Better Auth's middleware. Run
      // the normal sliding refresh only after live access and quota validation.
      const disableRefresh =
        request.query?.disableRefresh === true ||
        request.query?.disableRefresh === 'true'
      if (access && path === '/convex/token' && !disableRefresh)
        await readSession(false)
      if (session && isSignInPath(path))
        Object.assign(request.context, {
          previousSessionId: session.session.id,
        })
      if (!session) {
        if (
          verificationPaths.has(path) ||
          managingFactorPaths.has(path) ||
          path.startsWith('/admin/')
        )
          forbidden()
        return
      }
      if (
        !access &&
        !isSignInPath(path) &&
        !['/sign-out', '/admin/stop-impersonating'].includes(path)
      )
        forbidden('UNAUTHENTICATED')
      if (
        access?.impersonatedBy &&
        ![
          '/convex/token',
          '/get-session',
          '/sign-out',
          '/admin/stop-impersonating',
        ].includes(path)
      )
        forbidden('IMPERSONATION_RESTRICTED')
      if (
        access &&
        !access.mfaVerified &&
        !isSignInPath(path) &&
        !pendingSessionPaths.has(path)
      )
        forbidden('MFA_REQUIRED')
      if (
        path === '/admin/impersonate-user' &&
        (!access ||
          access.impersonatedBy ||
          Date.now() - access.createdAt >= RECENT_AUTH_MAX_AGE_SECONDS * 1000)
      )
        forbidden('REAUTHENTICATION_REQUIRED')
      if (managingFactorPaths.has(path) && !modules.AUTH_MFA_ENABLED)
        forbidden('MODULE_DISABLED')
      const operation = sensitivePaths[path]
      if (operation) {
        try {
          await action.runMutation(
            components.betterAuth.identityConfirmation.consume,
            {
              userId: session.user.id,
              sessionId: session.session.id,
              operation,
            }
          )
        } catch {
          forbidden('IDENTITY_CONFIRMATION_REQUIRED')
        }
      }
      if (path === '/admin/impersonate-user') {
        if (!access?.mfaRequired) forbidden('MFA_REQUIRED')
        if (!modules.ADMIN_USER_IDS.includes(session.user.id)) forbidden()
        const target = z.object({ userId: z.string() }).parse(request.body)
        if (modules.ADMIN_USER_IDS.includes(target.userId)) forbidden()
      }
      if (verificationPaths.has(path)) {
        const factorId = await requireActionCtx(ctx).runQuery(
          components.betterAuth.access.currentFactor,
          { userId: session.user.id }
        )
        if (!factorId) forbidden()
        Object.assign(request.context, { verifiedFactorId: factorId })
        const options = z
          .object({
            trustDevice: z.boolean().optional(),
            disableSession: z.boolean().optional(),
          })
          .loose()
          .parse(request.body)
        if (options.trustDevice || options.disableSession) forbidden()
        try {
          await requireActionCtx(ctx).runMutation(
            internal.authSecurity.consumeMfaAttempt,
            { userId: session.user.id }
          )
        } catch {
          throw new APIError('TOO_MANY_REQUESTS', {
            code: 'RATE_LIMITED',
            message: 'Too many verification attempts.',
          })
        }
      }
    }),
    after: createAuthMiddleware(async (request) => {
      // Endpoint response headers replace the before-hook accumulator. Forward
      // the validated refresh cookies alongside the token endpoint's own cookie.
      const { refreshedSessionCookies } = z
        .object({ refreshedSessionCookies: z.array(z.string()).optional() })
        .parse(request.context)
      for (const cookie of refreshedSessionCookies ?? []) {
        if (!request.context.responseHeaders)
          request.context.responseHeaders = new Headers()
        request.context.responseHeaders.append('set-cookie', cookie)
      }
      if (
        isAPIError(request.context.returned) ||
        (request.context.returned instanceof Response &&
          !request.context.returned.ok)
      )
        return undefined
      if (request.path === '/passkey/generate-authenticate-options') {
        // Passkey 1.6.22 hardcodes "preferred" for sign-in, independently of
        // authenticatorSelection. Ask password managers for the UV proof that
        // our afterVerification hook requires before creating a session.
        return request.json({
          ...passkeyAuthenticationOptions.parse(request.context.returned),
          userVerification: 'required',
        })
      }
      const session = request.context.newSession ?? request.context.session
      if (!session) return undefined
      const action = requireActionCtx(ctx)
      if (isSignInPath(request.path ?? '') && request.context.newSession) {
        const previous = z
          .object({ previousSessionId: z.string().optional() })
          .parse(request.context).previousSessionId
        if (previous)
          await action.runMutation(
            components.betterAuth.access.replaceSession,
            {
              previousId: previous,
              sessionId: request.context.newSession.session.id,
              userId: request.context.newSession.user.id,
            }
          )
      }
      if (
        verificationPaths.has(request.path ?? '') &&
        resultUser.safeParse(request.context.returned).success
      ) {
        const { verifiedFactorId } = z
          .object({ verifiedFactorId: z.string() })
          .parse(request.context)
        await action.runMutation(
          components.betterAuth.access.verifySessionFactor,
          {
            userId: session.user.id,
            sessionId: session.session.id,
            factorId: verifiedFactorId,
          }
        )
      }
      if (
        request.path === '/admin/impersonate-user' &&
        request.context.newSession &&
        request.context.session
      ) {
        await action.runMutation(
          components.betterAuth.access.recordImpersonation,
          {
            sessionId: request.context.newSession.session.id,
            targetId: request.context.newSession.user.id,
            actorId: request.context.session.user.id,
            actorSessionId: request.context.session.session.id,
          }
        )
      }
      return undefined
    }),
  }
}
