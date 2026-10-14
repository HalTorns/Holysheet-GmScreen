import { spawnSync } from 'node:child_process'
import { realpathSync } from 'node:fs'

import { projectRoot } from './local-config.mjs'

// CI and source archives don't need local Git hooks.
const repository = spawnSync('git', ['rev-parse', '--show-toplevel'], {
  encoding: 'utf-8',
  cwd: projectRoot,
})
if (
  !process.env.CI &&
  repository.status === 0 &&
  repository.stdout?.trim() === realpathSync(projectRoot)
) {
  const result = spawnSync('pnpm', ['exec', 'lefthook', 'install'], {
    stdio: 'inherit',
    cwd: projectRoot,
  })
  process.exitCode = result.status ?? 1
}
