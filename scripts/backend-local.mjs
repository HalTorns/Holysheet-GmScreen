import { spawn } from 'node:child_process'
import { join } from 'node:path'

import {
  assertLocalDeploymentSelection,
  assertDockerPortsOwnership,
  assertPostgresConfiguration,
  localDeploymentEnvironment,
  prepareDockerEnvironment,
  projectRoot,
  readEnvironment,
} from './local-config.mjs'

try {
  const [mode, ...extraArguments] = process.argv.slice(2)
  if (!['dev', 'push'].includes(mode) || extraArguments.length)
    throw new Error(
      'Usage: pnpm backend:dev | pnpm backend:push. Extra flags and deployment selectors are not allowed. Use the dedicated release procedure for production.'
    )
  assertLocalDeploymentSelection()
  const identity = readEnvironment('.env.docker')
  if (!identity.COMPOSE_PROJECT_NAME || !identity.LOCAL_PROJECT_DIRECTORY)
    throw new Error('Run pnpm setup in this checkout before backend commands.')
  const dockerEnvironment = prepareDockerEnvironment()
  assertPostgresConfiguration(dockerEnvironment)
  assertDockerPortsOwnership(dockerEnvironment)
  const configuration = readEnvironment('.env.local')
  if (!configuration.CONVEX_SELF_HOSTED_ADMIN_KEY)
    throw new Error('Local backend configuration missing. Run pnpm setup.')
  const child = spawn(
    'pnpm',
    [
      'exec',
      'convex',
      'dev',
      ...(mode === 'push' ? ['--once'] : []),
      '--env-file',
      join(projectRoot, '.env.local'),
    ],
    {
      cwd: projectRoot,
      env: localDeploymentEnvironment(
        configuration.CONVEX_SELF_HOSTED_ADMIN_KEY
      ),
      stdio: 'inherit',
    }
  )
  for (const signal of ['SIGINT', 'SIGTERM'])
    process.once(signal, () => child.kill(signal))
  child.once('error', () => {
    console.error(
      'Could not start the local Convex CLI. Check pnpm installation.'
    )
    process.exitCode = 1
  })
  child.once('exit', (code, signal) => {
    process.exitCode = code ?? (signal === 'SIGINT' ? 130 : 143)
  })
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Local backend command failed.'
  )
  process.exitCode = 1
}
