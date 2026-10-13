import { existsSync, chmodSync } from 'node:fs'
import { join } from 'node:path'
import {
  assertLocalDeploymentSelection,
  assertDockerPortsOwnership,
  backendUrl,
  composeArguments,
  composeEnvironment,
  localDeploymentEnvironment,
  prepareDockerEnvironment,
  projectRoot,
  readEnvironment,
  run,
  writePrivateEnvironment,
} from './local-config.mjs'

async function setup() {
  assertLocalDeploymentSelection()
  const current = readEnvironment('.env.local')
  const dockerEnvironment = prepareDockerEnvironment()
  assertDockerPortsOwnership(dockerEnvironment)
  const originalDocker = readEnvironment('.env.docker')
  if (
    !existsSync(join(projectRoot, '.env.docker')) ||
    JSON.stringify(originalDocker) !== JSON.stringify(dockerEnvironment)
  )
    writePrivateEnvironment('.env.docker', dockerEnvironment)
  else chmodSync(join(projectRoot, '.env.docker'), 0o600)
  const dockerOptions = {
    capture: true,
    env: composeEnvironment(dockerEnvironment),
  }
  run(
    'docker',
    composeArguments(dockerEnvironment, ['up', '-d', '--wait']),
    dockerOptions,
  )
  const adminKey = run(
    'docker',
    composeArguments(dockerEnvironment, [
      'exec',
      '-T',
      'backend',
      './generate_admin_key.sh',
    ]),
    dockerOptions,
  )
  if (!adminKey || adminKey.includes('\n'))
    throw new Error('The backend returned an invalid admin key.')
  writePrivateEnvironment('.env.local', {
    ...current,
    VITE_SITE_URL: 'http://localhost:3000',
    VITE_CONVEX_URL: backendUrl,
    VITE_CONVEX_SITE_URL: 'http://127.0.0.1:3211',
    CONVEX_SELF_HOSTED_URL: backendUrl,
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
  })
  const changes = {
    SITE_URL: 'http://localhost:3000',
    PASSKEY_RP_ID: 'localhost',
    BETTER_AUTH_SECRET: dockerEnvironment.LOCAL_AUTH_SECRET,
    AUTH_EMAIL_PROVIDER: 'mailpit',
    AUTH_EMAIL_FROM: 'connexion@local.test',
    MAILPIT_URL: 'http://mailpit:8025',
  }
  const response = await fetch(
    `${backendUrl}/api/update_environment_variables`,
    {
      method: 'POST',
      headers: {
        Authorization: `Convex ${adminKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        changes: Object.entries(changes).map(([name, value]) => ({
          name,
          value,
        })),
      }),
      signal: AbortSignal.timeout(10_000),
    },
  )
  if (!response.ok)
    throw new Error(`Backend configuration failed (${response.status}).`)
  const env = localDeploymentEnvironment(adminKey)
  run('pnpm', ['auth:generate'], { env, capture: true })
  run(
    'pnpm',
    [
      'exec',
      'convex',
      'dev',
      '--once',
      '--env-file',
      join(projectRoot, '.env.local'),
    ],
    { env, capture: true },
  )
  console.info(
    'Services locaux prêts : Convex, dashboard et Mailpit. Configuration et secrets existants conservés.\nLancer pnpm dev et pnpm backend:dev dans deux terminaux.\nApplication : http://localhost:3000 — Emails : http://localhost:8025\nDashboard : pnpm dashboard (http://127.0.0.1:6791).',
  )
}

setup().catch((error) => {
  console.error(error instanceof Error ? error.message : 'Local setup failed.')
  process.exitCode = 1
})
