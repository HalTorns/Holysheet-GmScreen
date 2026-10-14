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
export function allowSupportUser(userId: string) {
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
      'env',
      ...(userId
        ? ['set', 'ADMIN_USER_IDS', userId]
        : ['remove', 'ADMIN_USER_IDS']),
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
