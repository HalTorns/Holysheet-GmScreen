import { afterEach, expect, test, vi } from 'vitest'
import { z } from 'zod'

import { api, components, internal } from '../../convex/_generated/api'
import {
  confirmOperation,
  createAuthenticatedUser,
  createBackendTest,
  createPasskey,
} from './fixtures'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
})
// HTTP E2E owns code generation/delivery. This boundary owns binding, attempt
// persistence, expiry, consumption and transactional rollback on denied changes.
test('proofs are bound to session and operation, expire, and cannot be reused', async () => {
  vi.useFakeTimers()
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'alice@example.test')
  const key = await createPasskey(backend, alice.userId)
  await createPasskey(backend, alice.userId)
  await confirmOperation(backend, alice, 'account.delete')
  await expect(
    alice.client.mutation(api.account.removePasskey, { id: key })
  ).rejects.toThrow('IDENTITY_CONFIRMATION_REQUIRED')
  await confirmOperation(backend, alice, `passkey.remove:${key}`)
  vi.advanceTimersByTime(300_000)
  await expect(
    alice.client.mutation(api.account.removePasskey, { id: key })
  ).rejects.toThrow('IDENTITY_CONFIRMATION_REQUIRED')
  await confirmOperation(backend, alice, `passkey.remove:${key}`)
  await alice.client.mutation(api.account.removePasskey, { id: key })
  await expect(
    alice.client.mutation(api.account.removePasskey, { id: key })
  ).rejects.toThrow('IDENTITY_CONFIRMATION_REQUIRED')
  const bob = await createAuthenticatedUser(backend, 'bob@example.test')
  await expect(
    backend.mutation(components.betterAuth.identityConfirmation.consume, {
      userId: alice.userId,
      sessionId: bob.sessionId,
      operation: 'account.delete',
    })
  ).rejects.toThrow('UNAUTHENTICATED')
  const secondSession: unknown = await backend.mutation(
    components.betterAuth.adapter.create,
    {
      input: {
        model: 'session',
        data: {
          userId: alice.userId,
          token: crypto.randomUUID(),
          createdAt: Date.now(),
          updatedAt: Date.now(),
          expiresAt: Date.now() + 3_600_000,
        },
      },
    }
  )
  const secondSessionId = z.object({ _id: z.string() }).parse(secondSession)._id
  const otherDevice = backend.withIdentity({
    ...alice.identity,
    sessionId: secondSessionId,
  })
  await confirmOperation(backend, alice, 'account.delete')
  await expect(
    otherDevice.mutation(api.account.deleteAccount, { confirmation: 'DELETE' })
  ).rejects.toThrow('IDENTITY_CONFIRMATION_REQUIRED')
  await alice.client.mutation(api.account.deleteAccount, {
    confirmation: 'DELETE',
  })
})
test('failed code attempts commit and lock the challenge after three failures', async () => {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'alice@example.test')
  const args = {
    userId: alice.userId,
    sessionId: alice.sessionId,
    operation: 'account.delete',
    digest: 'expected-proof',
  }
  await backend.mutation(components.betterAuth.identityConfirmation.issue, args)
  for (let attempt = 0; attempt < 3; attempt++)
    expect(
      await backend.mutation(
        components.betterAuth.identityConfirmation.verify,
        { ...args, digest: 'wrong-proof' }
      )
    ).toBe(false)
  expect(
    await backend.mutation(
      components.betterAuth.identityConfirmation.verify,
      args
    )
  ).toBe(false)
  await expect(
    alice.client.mutation(api.account.deleteAccount, { confirmation: 'DELETE' })
  ).rejects.toThrow('IDENTITY_CONFIRMATION_REQUIRED')
})

test.each(['quota', 'delivery'])(
  'a failed resend (%s) preserves the previously delivered identity code',
  async (failure) => {
    vi.stubEnv('SITE_URL', 'http://localhost:3000')
    vi.stubEnv('PASSKEY_RP_ID', 'localhost')
    vi.stubEnv(
      'BETTER_AUTH_SECRET',
      'synthetic-secret-used-only-by-the-backend-fixture'
    )
    vi.stubEnv('AUTH_EMAIL_PROVIDER', 'mailpit')
    vi.stubEnv('AUTH_EMAIL_FROM', 'fixture@example.test')
    vi.stubEnv('MAILPIT_URL', 'http://127.0.0.1:8025')
    let shouldFail = false
    let deliveredCode: string | undefined
    vi.stubGlobal('fetch', (_input: unknown, options: RequestInit) => {
      if (shouldFail) return Promise.resolve(new Response('', { status: 503 }))
      if (typeof options.body !== 'string')
        throw new Error('Invalid email fixture')
      deliveredCode = /\b\d{6}\b/.exec(options.body)?.[0]
      return Promise.resolve(new Response('{}', { status: 200 }))
    })
    const backend = createBackendTest()
    const user = await createAuthenticatedUser(backend, 'resend@example.test')
    await user.client.action(api.identityConfirmation.request, {
      operation: 'account.delete',
    })
    if (!deliveredCode) throw new Error('No confirmation was delivered')
    const firstCode = deliveredCode
    if (failure === 'quota')
      for (let index = 0; index < 4; index++)
        await backend.mutation(internal.emails.consumeIdentityQuota, {
          userId: user.userId,
        })
    else shouldFail = true
    await expect(
      user.client.action(api.identityConfirmation.request, {
        operation: 'account.delete',
      })
    ).rejects.toThrow()
    expect(
      await user.client.action(api.identityConfirmation.verify, {
        operation: 'account.delete',
        code: firstCode,
      })
    ).toBe(true)
    await user.client.mutation(api.account.deleteAccount, {
      confirmation: 'DELETE',
    })
    expect(await user.client.query(api.auth.getCurrentUser, {})).toBeNull()
  }
)
