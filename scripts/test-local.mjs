import { createServer } from 'node:net'
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

// Build and exercise our own server on a free port. Never reuse whichever app
// happens to answer on port 3000. Restore the backend's original origin.
process.once('SIGINT', () => {
  process.exitCode = 130
})
process.once('SIGTERM', () => {
  process.exitCode = 143
})
try {
  assertLocalDeploymentSelection()
  assertDockerPortsOwnership(prepareDockerEnvironment())
  const configuration = readEnvironment('.env.local')
  if (!configuration.CONVEX_SELF_HOSTED_ADMIN_KEY)
    throw new Error('Run pnpm setup before local browser tests.')
  const server = createServer()
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string')
    throw new Error('No local test port available.')
  const site = `http://localhost:${address.port}`
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) reject(new Error('Could not release the test port.'))
      else resolve()
    })
  })
  const mode = process.argv[2]
  if (
    mode &&
    !['modules', 'organizations', 'observability', 'spotlight'].includes(mode)
  )
    throw new Error(
      'Use test:e2e:local [modules|organizations|observability|spotlight].'
    )
  const env = {
    ...localDeploymentEnvironment(configuration.CONVEX_SELF_HOSTED_ADMIN_KEY),
    VITE_SITE_URL: site,
    PLAYWRIGHT_BASE_URL: site,
    PLAYWRIGHT_PRODUCTION: '1',
    PLAYWRIGHT_DEVELOPMENT: '',
    PLAYWRIGHT_AUTH_MODULES: '',
    PLAYWRIGHT_ORGANIZATIONS: '',
    PLAYWRIGHT_OBSERVABILITY: '',
    PLAYWRIGHT_SPOTLIGHT: '',
    PLAYWRIGHT_EXPECT_ORGANIZATIONS: mode === 'organizations' ? 'true' : '',
    // Keep inherited product telemetry/protection credentials out of test
    // transports. Targeted modes below activate only their isolated target.
    SENTRY_DSN: '',
    VITE_SENTRY_DSN: '',
    VITE_POSTHOG_KEY: '',
    SPOTLIGHT_ENABLED: 'false',
    VITE_SPOTLIGHT_ENABLED: 'false',
    ARCJET_ENABLED: 'false',
    ...(mode === 'spotlight'
      ? {
          PLAYWRIGHT_DEVELOPMENT: '1',
          PLAYWRIGHT_SPOTLIGHT: '1',
          SPOTLIGHT_ENABLED: 'true',
          VITE_SPOTLIGHT_ENABLED: 'true',
        }
      : {}),
    ...(mode === 'observability'
      ? {
          PLAYWRIGHT_OBSERVABILITY: '1',
          VITE_POSTHOG_KEY: 'public-test-project',
          VITE_POSTHOG_HOST: 'https://analytics.example.test',
          VITE_SENTRY_DSN: 'https://public@errors.example.test/1',
        }
      : {}),
  }
  const file = join(projectRoot, '.env.local')
  if (mode !== 'organizations') delete env.PLAYWRIGHT_EXPECT_ORGANIZATIONS
  const command = (args) =>
    run('pnpm', ['exec', 'convex', 'env', ...args, '--env-file', file], {
      capture: true,
      env,
    })
  const original = command(['get', 'SITE_URL'])
  try {
    command(['set', 'SITE_URL', site])
    run('pnpm', ['build'], { env })
    if (mode === 'modules')
      run('pnpm', ['test:e2e:modules'], { env, timeout: 600_000 })
    else if (mode === 'organizations')
      run('pnpm', ['test:e2e:organizations', '--all'], {
        env,
        timeout: 600_000,
      })
    else if (mode === 'observability')
      run(
        'pnpm',
        ['exec', 'playwright', 'test', 'tests/e2e/observability.spec.ts'],
        { env, timeout: 600_000 }
      )
    else if (mode === 'spotlight')
      run(
        'pnpm',
        ['exec', 'playwright', 'test', 'tests/e2e/spotlight.spec.ts'],
        { env, timeout: 600_000 }
      )
    else run('pnpm', ['test:e2e'], { env, timeout: 600_000 })
  } finally {
    let restored = true
    try {
      command(original ? ['set', 'SITE_URL', original] : ['remove', 'SITE_URL'])
    } catch {
      restored = false
    }
    try {
      run('pnpm', ['build'], {
        capture: true,
        env: {
          ...localDeploymentEnvironment(
            configuration.CONVEX_SELF_HOSTED_ADMIN_KEY
          ),
          VITE_SITE_URL:
            process.env.VITE_SITE_URL ?? configuration.VITE_SITE_URL,
        },
      })
    } catch {
      restored = false
    }
    if (!restored) {
      console.error(
        'The original backend origin or frontend build could not be restored; private values omitted.'
      )
      process.exitCode = 1
    }
  }
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Local browser verification failed.'
  )
  process.exitCode = 1
}
