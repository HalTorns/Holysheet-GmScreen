import { join } from 'node:path'

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
  run(
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
