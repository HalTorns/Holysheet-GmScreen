import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

import {
  assertLocalDeploymentSelection,
  assertDockerPortsOwnership,
  localDeploymentEnvironment,
  prepareDockerEnvironment,
  projectRoot,
  readEnvironment,
  run,
} from './local-config.mjs'

process.once('SIGINT', () => {
  process.exitCode = 130
})
process.once('SIGTERM', () => {
  process.exitCode = 143
})
try {
  assertLocalDeploymentSelection()
  const docker = prepareDockerEnvironment()
  assertDockerPortsOwnership(docker)
  const configuration = readEnvironment('.env.local')
  if (!configuration.CONVEX_SELF_HOSTED_ADMIN_KEY)
    throw new Error('Run pnpm setup before module tests.')
  const env = localDeploymentEnvironment(
    configuration.CONVEX_SELF_HOSTED_ADMIN_KEY
  )
  const file = join(projectRoot, '.env.local')
  const command = (args) =>
    run('pnpm', ['exec', 'convex', 'env', ...args, '--env-file', file], {
      capture: true,
      env,
    })
  const names = [
    'AUTH_MAGIC_LINK_ENABLED',
    'AUTH_MFA_ENABLED',
    'AUTH_ADMIN_ENABLED',
    'ADMIN_USER_IDS',
    'AUTH_PROXY_SECRET',
    'AUTH_PROXY_REQUIRED',
  ]
  const proxySecret = randomBytes(32).toString('base64url')
  const original = new Map(names.map((name) => [name, command(['get', name])]))
  try {
    for (const name of names)
      command(
        name === 'ADMIN_USER_IDS'
          ? ['remove', name]
          : ['set', name, name === 'AUTH_PROXY_SECRET' ? proxySecret : 'true']
      )
    run(
      'pnpm',
      ['exec', 'playwright', 'test', 'tests/e2e/auth-modules.spec.ts'],
      {
        env: {
          ...env,
          PLAYWRIGHT_AUTH_MODULES: '1',
          AUTH_PROXY_SECRET: proxySecret,
        },
        timeout: 600_000,
      }
    )
  } finally {
    const failures = []
    for (const [name, value] of [...original].toReversed()) {
      try {
        command(value ? ['set', name, value] : ['remove', name])
      } catch {
        failures.push(name)
      }
    }
    if (failures.length) {
      console.error(
        `Restore failed for backend variables: ${failures.join(', ')}. Values omitted.`
      )
      process.exitCode = 1
    }
  }
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Auth module verification failed.'
  )
  process.exitCode = 1
}
