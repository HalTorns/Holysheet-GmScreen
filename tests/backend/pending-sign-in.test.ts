import { afterEach, expect, test, vi } from 'vitest'

import { api, components } from '../../convex/_generated/api'
import { createAuth } from '../../convex/auth'
import { z } from '../../shared/zod'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

const siteUrl = 'http://localhost:3000'
const sessionCookieName = 'better-auth.session_token'
const backupCookieName = 'better-auth.pending_sign_in'
const documentId = z.object({ _id: z.string() })
const sessionResult = z.object({ session: z.object({ id: z.string() }) })

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})

// Independent cookie-protocol fixture: no cookie or token enters diagnostics.
async function signedCookie(name: string, value: string, secret: string) {
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(value))
  )
  return `${name}=${encodeURIComponent(`${value}.${btoa(String.fromCodePoint(...signature))}`)}`
}

function responseCookie(setCookie: string | null, name: string) {
  const cookie = setCookie
    ?.split(/,(?=\s*[^;,=\s]+=)/)
    .map((value) => value.trim())
    .find((value) => value.startsWith(`${name}=`))
  const pair = cookie?.split(';')[0]
  if (!cookie || !pair) throw new Error('Missing synthetic response cookie')
  return { pair, attributes: cookie.slice(pair.length).toLowerCase() }
}

async function createPendingFlow() {
  const secret = 'synthetic-pending-sign-in-fixture-secret-only'
  vi.stubEnv('SITE_URL', siteUrl)
  vi.stubEnv('PASSKEY_RP_ID', 'localhost')
  vi.stubEnv('BETTER_AUTH_SECRET', secret)
  vi.stubEnv('AUTH_EMAIL_PROVIDER', 'mailpit')
  vi.stubEnv('AUTH_EMAIL_FROM', 'fixture@example.test')
  vi.stubEnv('MAILPIT_URL', 'http://127.0.0.1:8025')
  let deliveredCode: string | undefined
  vi.stubGlobal('fetch', (_input: unknown, options: RequestInit) => {
    if (typeof options.body !== 'string')
      throw new Error('Invalid synthetic email request')
    const message = z
      .object({ Text: z.string() })
      .parse(JSON.parse(options.body))
    deliveredCode = /\b\d{6}\b/.exec(message.Text)?.[0]
    return Promise.resolve(new Response('{}', { status: 200 }))
  })
  const backend = createBackendTest()
  const user = await createAuthenticatedUser(backend, 'pending@example.test')
  const previousToken = 'synthetic-verified-session-for-pending-flow'
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'session',
      where: [{ field: '_id', value: user.sessionId }],
      update: { token: previousToken },
    },
  })
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: user.userId }],
      update: { twoFactorEnabled: true },
    },
  })
  const factorId = documentId.parse(
    await backend.mutation(components.betterAuth.adapter.create, {
      input: {
        model: 'twoFactor',
        data: {
          userId: user.userId,
          secret: 'encrypted-fixture',
          backupCodes: 'encrypted-fixture',
          verified: true,
        },
      },
    })
  )._id
  await backend.mutation(components.betterAuth.access.verifySessionFactor, {
    userId: user.userId,
    sessionId: user.sessionId,
    factorId,
  })
  const previousCookie = await signedCookie(
    sessionCookieName,
    previousToken,
    secret
  )
  const handle = (path: string, cookie: string, origin = siteUrl) =>
    backend.action(async (ctx) => {
      const auth = createAuth(ctx)
      // Better Auth skips origins by default in NODE_ENV=test. Exercise its
      // production middleware setting instead of that dependency test shortcut.
      const context = await auth.$context
      context.skipOriginCheck = false
      const response = await auth.handler(
        new Request(`${siteUrl}/api/auth${path}`, {
          method: 'POST',
          headers: { cookie, origin, 'content-type': 'application/json' },
          body: '{}',
        })
      )
      const result = z
        .object({ restored: z.boolean() })
        .safeParse(await response.json())
      return {
        status: response.status,
        setCookie: response.headers.get('set-cookie'),
        restored: result.success ? result.data.restored : null,
      }
    })
  function start() {
    return backend.action(async (ctx) => {
      const auth = createAuth(ctx)
      const send = await auth.handler(
        new Request(`${siteUrl}/api/auth/email-otp/send-verification-otp`, {
          method: 'POST',
          headers: {
            cookie: previousCookie,
            origin: siteUrl,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'pending@example.test',
            type: 'sign-in',
          }),
        })
      )
      expect(send.status).toBe(200)
      if (!deliveredCode) throw new Error('No synthetic sign-in code delivered')
      const response = await auth.handler(
        new Request(`${siteUrl}/api/auth/sign-in/email-otp`, {
          method: 'POST',
          headers: {
            cookie: previousCookie,
            origin: siteUrl,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            email: 'pending@example.test',
            otp: deliveredCode,
          }),
        })
      )
      expect(response.status).toBe(200)
      const pendingCookie = responseCookie(
        response.headers.get('set-cookie'),
        sessionCookieName
      ).pair
      const backup = responseCookie(
        response.headers.get('set-cookie'),
        backupCookieName
      )
      const current = await auth.handler(
        new Request(`${siteUrl}/api/auth/get-session`, {
          headers: { cookie: pendingCookie },
        })
      )
      expect(current.status).toBe(200)
      const pendingId = sessionResult.parse(await current.json()).session.id
      expect(pendingId === user.sessionId).toBe(false)
      expect(
        await backend
          .withIdentity({ ...user.identity, sessionId: pendingId })
          .query(api.auth.getCurrentUser, {})
      ).toBeNull()
      return { pendingCookie, backup, pendingId }
    })
  }
  return { backend, user, handle, start, flow: await start() }
}

// E2E owns successful TOTP/cancellation UX. This HTTP boundary owns cookie
// possession and malformed/stale restore attempts that normal browsers omit.
test('a valid pending flow restores the exact previous session with an HttpOnly backup', async () => {
  const { backend, user, handle, flow } = await createPendingFlow()
  expect(flow.backup.attributes.includes('httponly')).toBe(true)
  expect(flow.backup.attributes.includes('samesite=lax')).toBe(true)
  const response = await handle(
    '/pending-sign-in/cancel',
    `${flow.pendingCookie}; ${flow.backup.pair}`
  )
  expect(response.status).toBe(200)
  expect(response.restored).toBe(true)
  expect(response.setCookie?.includes('pending_sign_in=;') ?? false).toBe(true)
  const restoredCookie = responseCookie(
    response.setCookie,
    sessionCookieName
  ).pair
  const restoredId = await backend.action(async (ctx) => {
    const result = await createAuth(ctx).handler(
      new Request(`${siteUrl}/api/auth/get-session`, {
        headers: { cookie: restoredCookie },
      })
    )
    expect(result.status).toBe(200)
    return sessionResult.parse(await result.json()).session.id
  })
  expect(restoredId).toBe(user.sessionId)
  expect(await user.client.query(api.auth.getCurrentUser, {})).not.toBeNull()
  expect(
    await backend
      .withIdentity({ ...user.identity, sessionId: flow.pendingId })
      .query(api.auth.getCurrentUser, {})
  ).toBeNull()
})

test.each([
  'missing',
  'tampered',
  'different-flow',
  'expired',
  'revoked-previous',
  'unverified-previous',
] as const)(
  'a pending session cannot restore the previous session with a %s backup',
  async (state) => {
    const { backend, user, handle, start, flow } = await createPendingFlow()
    let backup = flow.backup.pair
    if (state === 'missing') backup = ''
    if (state === 'tampered') backup = `${backup.slice(0, -1)}!`
    if (state === 'different-flow') backup = (await start()).backup.pair
    if (state === 'expired') {
      vi.useFakeTimers()
      vi.setSystemTime(Date.now() + 300_001)
    }
    if (state === 'revoked-previous')
      await backend.mutation(components.betterAuth.adapter.deleteOne, {
        input: {
          model: 'session',
          where: [{ field: '_id', value: user.sessionId }],
        },
      })
    if (state === 'unverified-previous')
      await backend.mutation(components.betterAuth.adapter.deleteOne, {
        input: {
          model: 'sessionAssurances',
          where: [{ field: 'sessionId', value: user.sessionId }],
        },
      })
    const response = await handle(
      '/pending-sign-in/cancel',
      `${flow.pendingCookie}${backup ? `; ${backup}` : ''}`
    )
    expect(response.status).toBe(200)
    expect(response.restored).toBe(false)
    expect(
      responseCookie(response.setCookie, sessionCookieName).attributes.includes(
        'max-age=0'
      )
    ).toBe(true)
    expect(
      await backend.query(components.betterAuth.adapter.findOne, {
        model: 'session',
        where: [{ field: '_id', value: flow.pendingId }],
      })
    ).toBeNull()
  }
)

test('a foreign origin cannot cancel a pending flow or restore its previous session', async () => {
  const { handle, flow } = await createPendingFlow()
  const cookie = `${flow.pendingCookie}; ${flow.backup.pair}`
  const refused = await handle(
    '/pending-sign-in/cancel',
    cookie,
    'https://foreign.example'
  )
  expect(refused.status).toBe(403)
  const allowed = await handle('/pending-sign-in/cancel', cookie)
  expect(allowed.status).toBe(200)
  expect(allowed.restored).toBe(true)
})
