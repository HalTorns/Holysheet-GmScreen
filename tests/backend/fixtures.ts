import { register as registerMigrations } from '@convex-dev/migrations/test'
import { register as registerRateLimiter } from '@convex-dev/rate-limiter/test'
import { convexTest } from 'convex-test'
import { z } from 'zod'

import { components } from '../../convex/_generated/api'
import authSchema from '../../convex/betterAuth/schema'
import schema from '../../convex/schema'

const modules = import.meta.glob('../../convex/**/*.ts')
const authModules = import.meta.glob('../../convex/betterAuth/**/*.ts')
const documentIdSchema = z.object({ _id: z.string() }).loose()

export function createBackendTest() {
  const backend = convexTest(schema, modules)
  // The official component harness uses its packaged default schema, which
  // excludes passkeys. Register our actual local-install schema and adapter.
  backend.registerComponent('betterAuth', authSchema, authModules)
  registerRateLimiter(backend)
  registerMigrations(backend)
  return backend
}

type Backend = ReturnType<typeof createBackendTest>

export async function createAuthenticatedUser(
  backend: Backend,
  email: string,
  options: { sessionCreatedAt?: number; emailVerified?: boolean } = {}
) {
  const now = Date.now()
  const user: unknown = await backend.mutation(
    components.betterAuth.adapter.create,
    {
      input: {
        model: 'user',
        data: {
          role: 'user',
          name: email.split('@')[0] ?? 'User',
          email,
          emailVerified: options.emailVerified ?? true,
          createdAt: now,
          updatedAt: now,
        },
      },
    }
  )
  const userId = documentIdSchema.parse(user)._id
  const session: unknown = await backend.mutation(
    components.betterAuth.adapter.create,
    {
      input: {
        model: 'session',
        data: {
          userId,
          token: crypto.randomUUID(),
          createdAt: options.sessionCreatedAt ?? now,
          updatedAt: now,
          expiresAt: now + 3_600_000,
        },
      },
    }
  )
  const sessionId = documentIdSchema.parse(session)._id
  const identity = {
    subject: userId,
    sessionId,
    tokenIdentifier: `test|${userId}`,
  }
  return { userId, sessionId, identity, client: backend.withIdentity(identity) }
}

export async function createPasskey(backend: Backend, userId: string) {
  const passkey: unknown = await backend.mutation(
    components.betterAuth.adapter.create,
    {
      input: {
        model: 'passkey',
        data: {
          userId,
          publicKey: 'stored-public-key',
          credentialID: crypto.randomUUID(),
          counter: 0,
          deviceType: 'singleDevice',
          backedUp: false,
          createdAt: Date.now(),
        },
      },
    }
  )
  return documentIdSchema.parse(passkey)._id
}

// Backend tests own proof consumption/binding. HTTP delivery is exercised in E2E.
export async function confirmOperation(
  backend: Backend,
  user: { userId: string; sessionId: string },
  operation: string
) {
  const args = {
    userId: user.userId,
    sessionId: user.sessionId,
    operation,
    digest: 'backend-fixture-proof',
  }
  await backend.mutation(components.betterAuth.identityConfirmation.issue, args)
  await backend.mutation(
    components.betterAuth.identityConfirmation.verify,
    args
  )
}
