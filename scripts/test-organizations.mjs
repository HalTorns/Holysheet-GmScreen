import { join } from 'node:path'

import {
  assertLocalDeploymentSelection,
  assertDockerPortsOwnership,
  localDeploymentEnvironment,
  projectRoot,
  readEnvironment,
  prepareDockerEnvironment,
  run,
} from './local-config.mjs'

// Exercises the real optional mode on an explicitly local backend, preserving
// its original flag. This selector affects tests only; authorization remains
// the backend's ORGANIZATIONS_ENABLED plus live memberships.
// Retain finally cleanup when the foreground child is interrupted.
process.once('SIGINT', () => {
  process.exitCode = 130
})
process.once('SIGTERM', () => {
  process.exitCode = 143
})
try {
  assertLocalDeploymentSelection()
  const arguments_ = process.argv.slice(2)
  if (
    arguments_.length > 1 ||
    arguments_.some((argument) => argument !== '--all')
  )
    throw new Error(
      'Use --all to run the complete browser suite in organization mode.'
    )
  if (!readEnvironment('.env.docker').COMPOSE_PROJECT_NAME)
    throw new Error(
      'Run pnpm setup to establish this checkout’s Docker identity before organization tests.'
    )
  const dockerEnvironment = prepareDockerEnvironment()
  assertDockerPortsOwnership(dockerEnvironment)
  const configuration = readEnvironment('.env.local')
  if (!configuration.CONVEX_SELF_HOSTED_ADMIN_KEY)
    throw new Error('Run pnpm setup before the organization browser tests.')
  const env = localDeploymentEnvironment(
    configuration.CONVEX_SELF_HOSTED_ADMIN_KEY
  )
  const file = join(projectRoot, '.env.local')
  const original = run(
    'pnpm',
    [
      'exec',
      'convex',
      'env',
      'get',
      'ORGANIZATIONS_ENABLED',
      '--env-file',
      file,
    ],
    { capture: true, env }
  )
  if (!['', 'false', 'true'].includes(original))
    throw new Error('ORGANIZATIONS_ENABLED must be true or false.')
  try {
    run(
      'pnpm',
      [
        'exec',
        'convex',
        'env',
        'set',
        'ORGANIZATIONS_ENABLED',
        'true',
        '--env-file',
        file,
      ],
      { capture: true, env }
    )
    run(
      'pnpm',
      [
        'exec',
        'playwright',
        'test',
        ...(arguments_.includes('--all')
          ? []
          : ['tests/e2e/organizations.spec.ts']),
      ],
      { env: { ...env, PLAYWRIGHT_ORGANIZATIONS: '1' }, timeout: 600_000 }
    )
  } finally {
    const change = original
      ? ['set', 'ORGANIZATIONS_ENABLED', original]
      : ['remove', 'ORGANIZATIONS_ENABLED']
    run('pnpm', ['exec', 'convex', 'env', ...change, '--env-file', file], {
      capture: true,
      env,
    })
  }
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Organization browser verification failed.'
  )
  process.exitCode = 1
}
