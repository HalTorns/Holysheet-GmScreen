import type { GenericCtx } from '@convex-dev/better-auth'
import { requireActionCtx } from '@convex-dev/better-auth/utils'
import type { BetterAuthPlugin } from 'better-auth'
import {
  APIError,
  createAuthEndpoint,
  createAuthMiddleware,
  isAPIError,
} from 'better-auth/api'
import {
  deleteSessionCookie,
  expireCookie,
  setSessionCookie,
} from 'better-auth/cookies'

import { z } from '../../shared/zod'
import { components } from '../_generated/api'
import type { DataModel } from '../_generated/dataModel'
import { isSignInPath } from './authHooks'
import { getSessionAccess } from './sessionAccess'

const COOKIE_NAME = 'pending_sign_in'
const FLOW_MAX_AGE_SECONDS = 300
const backupSchema = z.object({
  pendingId: z.string(),
  token: z.string(),
  expiresAt: z.number(),
})
function parseBackup(raw: string | false | null) {
  try {
    const parsed = backupSchema.safeParse(JSON.parse(raw || 'null'))
    return parsed.success && parsed.data.expiresAt > Date.now()
      ? parsed.data
      : null
  } catch {
    return null
  }
}

export function pendingSignInPlugin(ctx: GenericCtx<DataModel>) {
  const action = () => requireActionCtx(ctx)
  return {
    id: 'pending-sign-in',
    endpoints: {
      cancelPendingSignIn: createAuthEndpoint(
        '/pending-sign-in/cancel',
        {
          method: 'POST',
          requireHeaders: true,
        },
        async (request) => {
          const current = request.context.session
          if (!current) throw new APIError('UNAUTHORIZED')
          const cookie = request.context.createAuthCookie(COOKIE_NAME, {
            maxAge: FLOW_MAX_AGE_SECONDS,
          })
          const backup = parseBackup(
            await request.getSignedCookie(cookie.name, request.context.secret)
          )
          const previous =
            backup?.pendingId === current.session.id
              ? await request.context.internalAdapter.findSession(backup.token)
              : null
          const restored = await action().runMutation(
            components.betterAuth.access.cancelPendingSignIn,
            {
              userId: current.user.id,
              sessionId: current.session.id,
              ...(previous && previous.user.id === current.user.id
                ? { previousId: previous.session.id }
                : {}),
            }
          )
          expireCookie(request, cookie)
          if (restored && previous) await setSessionCookie(request, previous)
          else deleteSessionCookie(request)
          return request.json({ restored })
        }
      ),
    },
    hooks: {
      after: [
        {
          matcher: (request) =>
            isSignInPath(request.path ?? '') ||
            [
              '/two-factor/verify-totp',
              '/two-factor/verify-backup-code',
              '/sign-out',
            ].includes(request.path ?? ''),
          handler: createAuthMiddleware(async (request) => {
            if (
              isAPIError(request.context.returned) ||
              (request.context.returned instanceof Response &&
                !request.context.returned.ok)
            )
              return
            const cookie = request.context.createAuthCookie(COOKIE_NAME, {
              maxAge: FLOW_MAX_AGE_SECONDS,
            })
            const current = request.context.newSession
            const previous = request.context.session
            const access = current
              ? await getSessionAccess(ctx, current.session.id, current.user.id)
              : null
            if (
              !isSignInPath(request.path ?? '') ||
              !current ||
              !previous ||
              current.user.id !== previous.user.id ||
              !access ||
              access.mfaVerified ||
              access.impersonatedBy
            ) {
              expireCookie(request, cookie)
              return
            }
            const backup = parseBackup(
              await request.getSignedCookie(cookie.name, request.context.secret)
            )
            const original =
              backup?.pendingId === previous.session.id
                ? await request.context.internalAdapter.findSession(
                    backup.token
                  )
                : previous
            const originalAccess =
              original && original.user.id === current.user.id
                ? await getSessionAccess(
                    ctx,
                    original.session.id,
                    original.user.id
                  )
                : null
            if (
              !original ||
              !originalAccess?.mfaVerified ||
              originalAccess.impersonatedBy
            ) {
              expireCookie(request, cookie)
              return
            }
            const expiresAt = Math.min(
              backup?.pendingId === previous.session.id
                ? backup.expiresAt
                : Infinity,
              Date.now() + FLOW_MAX_AGE_SECONDS * 1000
            )
            await request.setSignedCookie(
              cookie.name,
              JSON.stringify({
                pendingId: current.session.id,
                token: original.session.token,
                expiresAt,
              }),
              request.context.secret,
              {
                ...cookie.attributes,
                maxAge: Math.max(
                  0,
                  Math.floor((expiresAt - Date.now()) / 1000)
                ),
              }
            )
          }),
        },
      ],
    },
  } satisfies BetterAuthPlugin
}
