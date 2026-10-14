import type { GenericCtx } from '@convex-dev/better-auth'
import { requireActionCtx } from '@convex-dev/better-auth/utils'
import {
  APIError,
  createAuthMiddleware,
  getSessionFromCtx,
  isAPIError,
} from 'better-auth/api'

import { RECENT_AUTH_MAX_AGE_SECONDS } from '../../shared/validation'
import { z } from '../../shared/zod'
import { components, internal } from '../_generated/api'
import type { DataModel } from '../_generated/dataModel'
import { getAuthModules } from './authModules'
import { getSessionAccess } from './sessionAccess'

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
  ...verificationPaths,
])
const resultUser = z.object({ user: z.object({ id: z.string() }) }).loose()

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
      const session = await getSessionFromCtx(request)
      if (!session) {
        if (
          verificationPaths.has(path) ||
          managingFactorPaths.has(path) ||
          path.startsWith('/admin/')
        )
          forbidden()
        return
      }
      const access = await getSessionAccess(
        ctx,
        session.session.id,
        session.user.id
      )
      if (!access && !['/sign-out', '/admin/stop-impersonating'].includes(path))
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
      if (access && !access.mfaVerified && !pendingSessionPaths.has(path))
        forbidden('MFA_REQUIRED')
      if (managingFactorPaths.has(path) || path === '/admin/impersonate-user') {
        if (
          !access ||
          access.impersonatedBy ||
          Date.now() - access.createdAt >= RECENT_AUTH_MAX_AGE_SECONDS * 1000
        )
          forbidden('REAUTHENTICATION_REQUIRED')
        if (managingFactorPaths.has(path) && !modules.AUTH_MFA_ENABLED)
          forbidden('MODULE_DISABLED')
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
      if (
        isAPIError(request.context.returned) ||
        (request.context.returned instanceof Response &&
          !request.context.returned.ok)
      )
        return
      const session = request.context.newSession ?? request.context.session
      if (!session) return
      const action = requireActionCtx(ctx)
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
    }),
  }
}
