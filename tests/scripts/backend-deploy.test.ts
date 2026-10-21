// @vitest-environment node

import { spawnSync } from 'node:child_process'
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, expect, test } from 'vitest'

const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true }))
  )
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'boilerplate-deploy-test-'))
  directories.push(directory)
  await mkdir(join(directory, 'scripts'))
  await mkdir(join(directory, 'bin'))
  await copyFile(
    new URL('../../scripts/backend-deploy.mjs', import.meta.url),
    join(directory, 'scripts/backend-deploy.mjs')
  )
  const log = join(directory, 'commands.jsonl')
  await writeFile(log, '')
  // Only external process outcomes are simulated; the release entrypoint is real.
  await writeFile(
    join(directory, 'bin/pnpm'),
    `#!${process.execPath}
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
appendFileSync(process.env.TEST_COMMAND_LOG, JSON.stringify(args) + '\\n')
process.exit(Number(args[0] === 'ts' ? process.env.TEST_TYPES_EXIT : process.env.TEST_DEPLOY_EXIT))
`,
    { mode: 0o700 }
  )
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(([name]) => !name.startsWith('CONVEX_'))
  )
  return {
    directory,
    log,
    environment: {
      ...environment,
      PATH: `${join(directory, 'bin')}:${process.env.PATH ?? ''}`,
      CONVEX_SELF_HOSTED_URL: 'http://backend:3210',
      CONVEX_SELF_HOSTED_ADMIN_KEY: 'synthetic-release-key',
      TEST_COMMAND_LOG: log,
      TEST_TYPES_EXIT: '0',
      TEST_DEPLOY_EXIT: '0',
    },
  }
}

function deploy(
  release: Awaited<ReturnType<typeof fixture>>,
  environment: Record<string, string> = {},
  args: string[] = []
) {
  return spawnSync(
    process.execPath,
    [join(release.directory, 'scripts/backend-deploy.mjs'), ...args],
    {
      cwd: release.directory,
      env: { ...release.environment, ...environment },
      encoding: 'utf-8',
      timeout: 5000,
    }
  )
}

test('a failed root typecheck prevents any publication', async () => {
  const release = await fixture()
  const result = deploy(release, { TEST_TYPES_EXIT: '2' })
  expect(result.status).toBe(2)
  expect(await readFile(release.log, 'utf-8')).toBe('["ts"]\n')
})

test.each([0, 7])(
  'publishes after typecheck and returns deploy exit %i',
  async (exit) => {
    const release = await fixture()
    const result = deploy(release, { TEST_DEPLOY_EXIT: String(exit) })
    expect(result.status).toBe(exit)
    expect(
      (await readFile(release.log, 'utf-8'))
        .trim()
        .split('\n')
        .map((line): unknown => JSON.parse(line))
    ).toEqual([
      ['ts'],
      ['exec', 'convex', 'deploy', '--yes', '--typecheck', 'disable'],
    ])
  }
)

test.each([
  { environment: { CONVEX_SELF_HOSTED_ADMIN_KEY: '' }, file: '', args: [] },
  { environment: { CONVEX_SELF_HOSTED_URL: '' }, file: '', args: [] },
  {
    environment: { CONVEX_DEPLOY_KEY: 'synthetic-cloud-key' },
    file: '',
    args: [],
  },
  { environment: {}, file: '.env.local', args: [] },
  { environment: {}, file: '.env', args: [] },
  { environment: {}, file: '', args: ['--prod'] },
])(
  'refuses an implicit or ambiguous release target: %j',
  async ({ environment, file, args }) => {
    const release = await fixture()
    if (file) await writeFile(join(release.directory, file), 'private-content')
    const result = deploy(release, environment, args)
    expect(result.status).toBe(1)
    expect(await readFile(release.log, 'utf-8')).toBe('')
    expect(result.stderr).not.toContain('synthetic-release-key')
    expect(result.stderr).not.toContain('private-content')
  }
)
