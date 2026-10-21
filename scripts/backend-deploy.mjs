import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'

const projectRoot = join(import.meta.dirname, '..')

function run(arguments_) {
  const result = spawnSync('pnpm', arguments_, {
    cwd: projectRoot,
    stdio: 'inherit',
  })
  if (result.error)
    throw new Error('Could not start pnpm for backend deployment.')
  return result.status ?? 1
}

try {
  if (process.argv.length > 2)
    throw new Error(
      'Usage: pnpm backend:deploy. Extra arguments are not allowed.'
    )
  if (
    ['.env', '.env.local'].some((name) => existsSync(join(projectRoot, name)))
  )
    throw new Error(
      'Use the operations container or a clean release checkout without .env or .env.local. Local development uses pnpm backend:push.'
    )
  if (
    ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT', 'CONVEX_DEPLOYMENT_TOKEN'].some(
      (name) => process.env[name]
    )
  )
    throw new Error(
      'Cloud and local deployment selectors are not allowed here.'
    )
  if (
    !process.env.CONVEX_SELF_HOSTED_URL ||
    !process.env.CONVEX_SELF_HOSTED_ADMIN_KEY
  )
    throw new Error(
      'Set CONVEX_SELF_HOSTED_URL and CONVEX_SELF_HOSTED_ADMIN_KEY in the operations runtime before deploying.'
    )

  // This repository uses the root tsconfig, not convex/tsconfig.json.
  process.exitCode = run(['ts'])
  if (process.exitCode === 0)
    process.exitCode = run([
      'exec',
      'convex',
      'deploy',
      '--yes',
      '--typecheck',
      'disable',
    ])
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Backend deployment failed.'
  )
  process.exitCode = 1
}
