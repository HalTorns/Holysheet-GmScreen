import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { hashPassword } from 'better-auth/crypto'
import { z } from 'zod'

import {
  assertLocalDeploymentSelection,
  assertDockerPortsOwnership,
  localDeploymentEnvironment,
  prepareDockerEnvironment,
  projectRoot,
  readEnvironment,
  run,
} from '../../scripts/local-config.mjs'

// A real local operator operation, with the same Docker/deployment guards as
// setup. No test endpoint or seeded administrator is exposed to the application.
function runLocalOperator(arguments_: string[]) {
  assertLocalDeploymentSelection()
  assertDockerPortsOwnership(prepareDockerEnvironment())
  const configuration = readEnvironment('.env.local')
  if (!configuration.CONVEX_SELF_HOSTED_ADMIN_KEY)
    throw new Error('Missing local test configuration.')
  return run(
    'pnpm',
    [
      'exec',
      'convex',
      ...arguments_,
      '--env-file',
      join(projectRoot, '.env.local'),
    ],
    {
      capture: true,
      env: localDeploymentEnvironment(
        configuration.CONVEX_SELF_HOSTED_ADMIN_KEY
      ),
    }
  )
}

export function allowSupportUser(userId: string) {
  runLocalOperator([
    'env',
    ...(userId
      ? ['set', 'ADMIN_USER_IDS', userId]
      : ['remove', 'ADMIN_USER_IDS']),
  ])
}
export function grantApplicationAdmin(userId: string) {
  runLocalOperator(['run', 'userAdmin:grant', JSON.stringify({ userId })])
}
export function ageSession(sessionId: string) {
  runLocalOperator([
    'run',
    '--component',
    'betterAuth',
    'adapter:updateOne',
    JSON.stringify({
      input: {
        model: 'session',
        where: [{ field: '_id', value: sessionId }],
        update: { createdAt: Date.now() - 3_600_000 },
      },
    }),
  ])
}
export function holdAuthTokenBudget(userId: string) {
  // A short reservation expires naturally; no existing budget or data is reset.
  runLocalOperator([
    'run',
    '--component',
    'rateLimiter',
    'lib:rateLimit',
    JSON.stringify({
      name: 'authTokenRead',
      key: `user:${userId}`,
      config: {
        kind: 'token bucket',
        rate: 120,
        period: 60_000,
        capacity: 120,
      },
      count: 140,
      reserve: true,
    }),
  ])
}

export async function addPasswordCredential(userId: string, password: string) {
  const now = Date.now()
  runLocalOperator([
    'run',
    '--component',
    'betterAuth',
    'adapter:create',
    JSON.stringify({
      input: {
        model: 'account',
        data: {
          userId,
          accountId: userId,
          providerId: 'credential',
          password: await hashPassword(password),
          createdAt: now,
          updatedAt: now,
        },
      },
    }),
  ])
}
export function resetResourceWriteBudget(userId: string) {
  // Le long parcours enchaîne bibliothèque, variables et widgets plus vite
  // qu'un MJ réel : on remet à zéro le seul seau de ce compte de test, sans
  // changer la limite de production.
  runLocalOperator([
    'run',
    '--component',
    'rateLimiter',
    'lib:resetRateLimit',
    JSON.stringify({ name: 'resourceWrite', key: userId }),
  ])
}

// Synthetic historical rows, inserted through the guarded operator CLI.
export function insertAuthFixture(
  model: 'organization' | 'member' | 'invitation' | 'passkey',
  data: Record<string, string | number | boolean>
) {
  const output = runLocalOperator([
    'run',
    '--component',
    'betterAuth',
    'adapter:create',
    JSON.stringify({ input: { model, data } }),
  ])
  return z.object({ _id: z.string() }).parse(JSON.parse(output))._id
}
export function insertResourceFixture(
  ownerId: string,
  title: string,
  organizationId?: string
) {
  const directory = mkdtempSync(join(tmpdir(), 'c2-fixture-'))
  try {
    const file = join(directory, 'resources.jsonl')
    writeFileSync(
      file,
      `${JSON.stringify({
        ownerId,
        title,
        description: '',
        updatedAt: Date.now(),
        ...(organizationId ? { organizationId } : {}),
      })}\n`
    )
    runLocalOperator([
      'import',
      '--append',
      '--table',
      'resources',
      file,
      '--yes',
    ])
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}
export function markHistoricalImpersonation(
  sessionId: string,
  actorId: string
) {
  runLocalOperator([
    'run',
    '--component',
    'betterAuth',
    'adapter:updateOne',
    JSON.stringify({
      input: {
        model: 'session',
        where: [{ field: '_id', value: sessionId }],
        update: { impersonatedBy: actorId },
      },
    }),
  ])
}

export function recordHistoricalImpersonation(input: {
  sessionId: string
  actorSessionId: string
  actorId: string
  targetId: string
}) {
  runLocalOperator([
    'run',
    '--component',
    'betterAuth',
    'access:recordImpersonation',
    JSON.stringify(input),
  ])
}
