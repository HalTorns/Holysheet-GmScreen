import { afterEach, expect, test, vi } from 'vitest'

import { components } from '../../convex/_generated/api'
import { createAuth } from '../../convex/auth'
import { z } from '../../shared/zod'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

afterEach(() => vi.unstubAllEnvs())

async function createHttpSession() {
  const secret = 'synthetic-http-session-fixture-secret-only'
  vi.stubEnv('SITE_URL', 'http://localhost:3000')
  vi.stubEnv('PASSKEY_RP_ID', 'localhost')
  vi.stubEnv('BETTER_AUTH_SECRET', secret)
  vi.stubEnv('AUTH_EMAIL_PROVIDER', 'mailpit')
  vi.stubEnv('AUTH_EMAIL_FROM', 'fixture@example.test')
  vi.stubEnv('MAILPIT_URL', 'http://127.0.0.1:8025')
  const backend = createBackendTest()
  const user = await createAuthenticatedUser(backend, 'transport@example.test')
  const token = 'synthetic-session-for-http-fault-fixture'
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'session',
      where: [{ field: '_id', value: user.sessionId }],
      update: { token },
    },
  })
  // Sign the synthetic cookie using Better Auth's HMAC-SHA256 cookie protocol.
  // Do not include its value in assertions or diagnostics.
  const encoder = new TextEncoder()
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )
  const signature = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(token))
  )
  const cookie = `better-auth.session_token=${encodeURIComponent(`${token}.${btoa(String.fromCodePoint(...signature))}`)}`
  return { backend, user, cookie, token }
}

// Browser interception covers network/HTTP retries. Only this dependency boundary
// can exercise an adapter read failure inside the real Better Auth HTTP handler.
test('a failed live session read returns a retryable server error without clearing the valid cookie', async () => {
  const { backend, cookie } = await createHttpSession()
  await backend.action(async (ctx) => {
    const auth = createAuth(ctx)
    const context = await auth.$context
    const request = () =>
      new Request('http://localhost:3000/api/auth/get-session', {
        headers: { cookie },
      })
    expect((await auth.handler(request())).status).toBe(200)
    const failure = vi
      .spyOn(context.internalAdapter, 'findSession')
      .mockRejectedValueOnce(new Error('Synthetic storage outage'))
    const logging = vi
      .spyOn(context.logger, 'error')
      .mockImplementation(() => {})
    try {
      const response = await auth.handler(request())
      expect(response.status).toBe(500)
      expect(
        response.headers.get('set-cookie')?.includes('Max-Age=0') ?? false
      ).toBe(false)
      expect((await auth.handler(request())).status).toBe(200)
    } finally {
      failure.mockRestore()
      logging.mockRestore()
    }
  })
})

// HTTP owns the interaction between our live-access hook and Better Auth's
// sliding refresh. Component revocation tests cannot reach that integration.
test.each(['active', 'revoked', 'no-refresh'] as const)(
  'token reads preserve live session expiry and refresh cookies (%s)',
  async (state) => {
    const { backend, user, cookie } = await createHttpSession()
    const now = Date.now()
    const day = 86_400_000
    const originalExpiry = now + 5 * day
    await backend.mutation(components.betterAuth.adapter.updateOne, {
      input: {
        model: 'session',
        where: [{ field: '_id', value: user.sessionId }],
        update: {
          createdAt: now - 2 * day,
          updatedAt: now - 2 * day,
          expiresAt: originalExpiry,
        },
      },
    })
    if (state === 'revoked')
      await backend.mutation(components.betterAuth.adapter.create, {
        input: {
          model: 'sessionRevocations',
          data: {
            userId: user.userId,
            revokedAt: now,
            expiresAt: now + 8 * day,
          },
        },
      })
    const refreshedCookie = await backend.action(async (ctx) => {
      const auth = createAuth(ctx)
      const response = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/convex/token${state === 'no-refresh' ? '?disableRefresh=true' : ''}`,
          { headers: { cookie } }
        )
      )
      expect(response.status).toBe(state === 'revoked' ? 403 : 200)
      return (
        response.headers.get('set-cookie')?.includes('session_token=') ?? false
      )
    })
    const stored: unknown = await backend.query(
      components.betterAuth.adapter.findOne,
      { model: 'session', where: [{ field: '_id', value: user.sessionId }] }
    )
    const session = z.object({ expiresAt: z.number() }).parse(stored)
    if (state === 'active') {
      expect(session.expiresAt).toBeGreaterThanOrEqual(now + 7 * day - 1000)
      expect(refreshedCookie).toBe(true)
    } else {
      expect(session.expiresAt).toBe(originalExpiry)
      expect(refreshedCookie).toBe(false)
    }
  }
)

// The Convex plugin normalizes Bearer credentials after user hooks. These real
// HTTP calls must not turn that ordering into another path around our guards.
test.each(['revoked token', 'passkey without identity proof'] as const)(
  'HTTP auth rejects Bearer session credentials before plugin normalization (%s)',
  async (operation) => {
    const { backend, user, cookie, token } = await createHttpSession()
    if (operation === 'revoked token')
      await backend.mutation(components.betterAuth.adapter.create, {
        input: {
          model: 'sessionRevocations',
          data: {
            userId: user.userId,
            revokedAt: Date.now(),
            expiresAt: Date.now() + 8 * 86_400_000,
          },
        },
      })
    await backend.action(async (ctx) => {
      const auth = createAuth(ctx)
      const passkey = operation === 'passkey without identity proof'
      if (passkey) {
        const guarded = await auth.handler(
          new Request(
            'http://localhost:3000/api/auth/passkey/verify-registration',
            {
              method: 'POST',
              headers: {
                cookie,
                origin: 'http://localhost:3000',
                'content-type': 'application/json',
              },
              body: JSON.stringify({ response: {} }),
            }
          )
        )
        expect(guarded.status).toBe(403)
        expect(
          z.object({ code: z.string() }).parse(await guarded.json()).code
        ).toBe('IDENTITY_CONFIRMATION_REQUIRED')
      }
      const response = await auth.handler(
        new Request(
          `http://localhost:3000/api/auth/${passkey ? 'passkey/verify-registration' : 'convex/token'}`,
          {
            method: passkey ? 'POST' : 'GET',
            headers: {
              authorization: `Bearer ${token}`,
              origin: 'http://localhost:3000',
              'content-type': 'application/json',
            },
            ...(passkey ? { body: JSON.stringify({ response: {} }) } : {}),
          }
        )
      )
      expect(response.status).toBe(403)
    })
  }
)

// Real credential endpoint + installed plugin: a primary session must survive
// to use the same guarded MFA protocol as OTP/passkeys (never a plugin cookie).
test('credential sign-in keeps a live primary session pending MFA', async () => {
  const { backend, user } = await createHttpSession()
  vi.stubEnv('AUTH_CREDENTIALS_ENABLED', 'true')
  await backend.action(async (ctx) => {
    const auth = createAuth(ctx)
    const context = await auth.$context
    await context.internalAdapter.linkAccount({
      userId: user.userId,
      accountId: user.userId,
      providerId: 'credential',
      password: await context.password.hash('synthetic-credential-password'),
    })
  })
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: user.userId }],
      update: { twoFactorEnabled: true },
    },
  })
  await backend.action(async (ctx) => {
    const auth = createAuth(ctx)
    const response = await auth.handler(
      new Request('http://localhost:3000/api/auth/sign-in/email', {
        method: 'POST',
        headers: {
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          email: 'transport@example.test',
          password: 'synthetic-credential-password',
        }),
      })
    )
    expect(response.status).toBe(200)
    const body: unknown = await response.json()
    expect(
      z.object({ user: z.object({ id: z.string() }) }).safeParse(body).success
    ).toBe(true)
    const cookie = response.headers
      .getSetCookie()
      .find(
        (value) =>
          value.startsWith('better-auth.session_token=') &&
          !value.includes('Max-Age=0')
      )
      ?.split(';')[0]
    expect(Boolean(cookie)).toBe(true)
    const live = await auth.handler(
      new Request('http://localhost:3000/api/auth/get-session', {
        headers: { cookie: cookie ?? '' },
      })
    )
    expect(
      z
        .object({ session: z.object({ id: z.string() }) })
        .safeParse(await live.json()).success
    ).toBe(true)
  })
})

// Cookie and JWT share the live validation: a legacy impersonated session must
// never regain access, even while its ordinary expiry remains valid.
test('historical impersonation is refused over cookie and JWT', async () => {
  const { backend, user, cookie } = await createHttpSession()
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'session',
      where: [{ field: '_id', value: user.sessionId }],
      update: { impersonatedBy: 'historical-operator' },
    },
  })
  await backend.action(async (ctx) => {
    const auth = createAuth(ctx)
    for (const path of ['/get-session', '/convex/token']) {
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          headers: { cookie },
        })
      )
      expect(response.status).toBe(403)
      expect(
        z.object({ code: z.string() }).parse(await response.json()).code
      ).toBe('UNAUTHENTICATED')
    }
  })
  const { api } = await import('../../convex/_generated/api')
  expect(await user.client.query(api.auth.getCurrentUser, {})).toBeNull()
})

test('an authorized MFA support operator cannot create impersonation and native organization writes stay closed', async () => {
  const { backend, user, cookie } = await createHttpSession()
  vi.stubEnv('AUTH_ADMIN_ENABLED', 'true')
  vi.stubEnv('AUTH_MFA_ENABLED', 'true')
  vi.stubEnv('ADMIN_USER_IDS', user.userId)
  vi.stubEnv('ORGANIZATIONS_ENABLED', 'true')
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: user.userId }],
      update: { twoFactorEnabled: true },
    },
  })
  const factor: unknown = await backend.mutation(
    components.betterAuth.adapter.create,
    {
      input: {
        model: 'twoFactor',
        data: {
          userId: user.userId,
          secret: 'synthetic-encrypted-factor',
          backupCodes: 'synthetic-encrypted-codes',
          verified: true,
        },
      },
    }
  )
  await backend.mutation(components.betterAuth.access.verifySessionFactor, {
    sessionId: user.sessionId,
    userId: user.userId,
    factorId: z.object({ _id: z.string() }).parse(factor)._id,
  })
  const target = await createAuthenticatedUser(
    backend,
    'target-transport@example.test'
  )
  const { api } = await import('../../convex/_generated/api')
  expect(
    (await user.client.query(api.auth.getAccessState, {}))?.isSupport
  ).toBe(true)
  await backend.action(async (ctx) => {
    const auth = createAuth(ctx)
    for (const path of [
      '/admin/impersonate-user',
      '/organization/create',
      '/organization/invite-member',
    ]) {
      const response = await auth.handler(
        new Request(`http://localhost:3000/api/auth${path}`, {
          method: 'POST',
          headers: {
            cookie,
            Origin: 'http://localhost:3000',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            userId: target.userId,
            name: 'Closed',
            slug: 'closed',
            email: 'new@example.test',
            role: 'member',
          }),
        })
      )
      expect(response.status).toBe(403)
      if (path === '/admin/impersonate-user')
        expect(
          z.object({ code: z.string() }).parse(await response.json()).code
        ).toBe('SURFACE_REMOVED')
    }
  })
  expect(await target.client.query(api.auth.getCurrentUser, {})).not.toBeNull()
})
