// @vitest-environment node

import { spawnSync } from 'node:child_process'
import {
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
  mkdir,
  copyFile,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'

import { afterEach, expect, test } from 'vitest'

const projectRoot = dirname(dirname(import.meta.dirname))
const directories: string[] = []

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true }))
  )
})

async function fixture() {
  const directory = await mkdtemp(join(tmpdir(), 'boilerplate-setup-test-'))
  directories.push(directory)
  const scripts = join(directory, 'scripts')
  const binaries = join(directory, 'bin')
  await mkdir(scripts)
  await mkdir(binaries)
  for (const name of await readdir(join(projectRoot, 'scripts'))) {
    if (name.endsWith('.mjs'))
      await copyFile(join(projectRoot, 'scripts', name), join(scripts, name))
  }
  await copyFile(
    join(projectRoot, 'docker-compose.yml'),
    join(directory, 'docker-compose.yml')
  )
  const log = join(directory, 'commands.jsonl')
  const fakeCommand = String.raw`#!${process.execPath}
import { appendFileSync } from 'node:fs'
const args = process.argv.slice(2)
appendFileSync(process.env.TEST_COMMAND_LOG, JSON.stringify({ program: process.argv[1].split('/').at(-1), args, cloudSelected: Boolean(process.env.CONVEX_DEPLOY_KEY || process.env.CONVEX_DEPLOYMENT_TOKEN || process.env.CONVEX_DEPLOYMENT), localUrl: process.env.CONVEX_SELF_HOSTED_URL }) + '\n')
if (args.includes('./generate_admin_key.sh')) console.log('development-only-fake-key')
if (args.includes('ps') && args.includes('-a') && process.env.TEST_LEGACY_OWNER) console.log('development-only-container-id')
if (args.includes('publish=' + process.env.TEST_PORT_NUMBER) && process.env.TEST_PORT_PROJECT) console.log(process.env.TEST_PORT_PROJECT)
if (args.includes('inspect')) console.log(process.env.TEST_COMPOSE_OWNER || process.cwd())
`
  await Promise.all(
    ['docker', 'pnpm'].map((name) =>
      writeFile(join(binaries, name), fakeCommand, { mode: 0o700 })
    )
  )
  const preload = join(directory, 'network.mjs')
  // The test owns filesystem preservation and target admission, not the backend API.
  await writeFile(
    preload,
    "globalThis.fetch = async () => new Response('{}', { status: 200 })\n"
  )
  const environment = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => !name.startsWith('CONVEX_') && !name.startsWith('COMPOSE_')
    )
  )
  return {
    directory,
    log,
    preload,
    environment: {
      ...environment,
      PATH: `${binaries}:${process.env.PATH ?? ''}`,
      TEST_COMMAND_LOG: log,
    },
  }
}

function setup(
  local: Awaited<ReturnType<typeof fixture>>,
  extraEnvironment: Record<string, string> = {}
) {
  return spawnSync(
    process.execPath,
    [
      '--import',
      local.preload,
      join(local.directory, 'scripts/setup-local.mjs'),
    ],
    {
      cwd: local.directory,
      env: { ...local.environment, ...extraEnvironment },
      encoding: 'utf-8',
      timeout: 5000,
    }
  )
}

async function commands(path: string): Promise<string> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return ''
  }
}

test.each([
  ['process', 'CONVEX_DEPLOY_KEY'],
  ['process', 'CONVEX_DEPLOYMENT_TOKEN'],
  ['process', 'CONVEX_DEPLOYMENT'],
  ['.env', 'CONVEX_DEPLOY_KEY'],
  ['.env.local', 'CONVEX_DEPLOYMENT_TOKEN'],
  ['.env.local', 'CONVEX_DEPLOYMENT'],
])(
  'le setup refuse le sélecteur cloud %s/%s avant toute mutation',
  async (source, selector) => {
    const local = await fixture()
    const current = 'CUSTOM_LOCAL_SETTING=keep-me\n'
    await writeFile(join(local.directory, '.env.local'), current)
    if (source !== 'process')
      await writeFile(
        join(local.directory, source),
        `export ${selector}=development-only-fake-selection\n`
      )
    const before = await readFile(join(local.directory, '.env.local'), 'utf-8')
    const result = setup(
      local,
      source === 'process'
        ? { [selector]: 'development-only-fake-selection' }
        : {}
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('remote Convex configuration')
    expect(await commands(local.log)).toBe('')
    expect(await readFile(join(local.directory, '.env.local'), 'utf-8')).toBe(
      before
    )
  }
)

test('réexécuter le setup conserve les variables du projet et les secrets locaux', async () => {
  const local = await fixture()
  await writeFile(
    join(local.directory, '.env.local'),
    'CUSTOM_LOCAL_SETTING="a project value"\nCUSTOM_PATH=C:\\a\\b\nCUSTOM_MULTILINE="line one\nline two"\nCUSTOM_QUOTES=both "double" and single quotes\n'
  )
  const originalCustomConfiguration = await readFile(
    join(local.directory, '.env.local'),
    'utf-8'
  )
  const first = setup(local)
  expect(first.status, first.stderr).toBe(0)
  const privateConfiguration = await readFile(
    join(local.directory, '.env.docker'),
    'utf-8'
  )
  const second = setup(local)
  expect(second.status, second.stderr).toBe(0)
  expect(
    parseEnv(await readFile(join(local.directory, '.env.local'), 'utf-8'))
      .CUSTOM_LOCAL_SETTING
  ).toBe('a project value')
  expect(
    await readFile(join(local.directory, '.env.local'), 'utf-8')
  ).toContain(originalCustomConfiguration)
  expect(await readFile(join(local.directory, '.env.docker'), 'utf-8')).toBe(
    privateConfiguration
  )
})

test('deux nouveaux checkouts reçoivent des identités et secrets différents', async () => {
  const first = await fixture()
  const second = await fixture()
  expect(setup(first).status).toBe(0)
  expect(setup(second).status).toBe(0)
  const before = parseEnv(
    await readFile(join(first.directory, '.env.docker'), 'utf-8')
  )
  const after = parseEnv(
    await readFile(join(second.directory, '.env.docker'), 'utf-8')
  )
  expect(before.COMPOSE_PROJECT_NAME).not.toBe(after.COMPOSE_PROJECT_NAME)
  // Compare without including private values in a failed assertion's output.
  expect(before.INSTANCE_SECRET !== after.INSTANCE_SECRET).toBe(true)
  expect(before.LOCAL_AUTH_SECRET !== after.LOCAL_AUTH_SECRET).toBe(true)
})

test('une configuration Docker copiée depuis un autre checkout est refusée avant Docker', async () => {
  const original = await fixture()
  expect(setup(original).status).toBe(0)
  const copy = await fixture()
  await copyFile(
    join(original.directory, '.env.docker'),
    join(copy.directory, '.env.docker')
  )
  const result = setup(copy)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('another checkout')
  expect(await commands(copy.log)).toBe('')
})

test.each(['test-organizations.mjs', 'dashboard.mjs'])(
  'le lanceur %s refuse un checkout copié avant tout accès privé',
  async (script) => {
    const original = await fixture()
    expect(setup(original).status).toBe(0)
    const copy = await fixture()
    for (const name of ['.env.docker', '.env.local'])
      await copyFile(join(original.directory, name), join(copy.directory, name))
    const result = spawnSync(
      process.execPath,
      [join(copy.directory, 'scripts', script)],
      {
        cwd: copy.directory,
        env: copy.environment,
        encoding: 'utf-8',
        timeout: 5000,
      }
    )
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('another checkout')
    expect(await commands(copy.log)).toBe('')
  }
)

test.each(['3210', '6791'])(
  'le port %s d’un autre projet refuse le setup avant création de services',
  async (port) => {
    const local = await fixture()
    const result = setup(local, {
      TEST_PORT_PROJECT: 'another-project',
      TEST_PORT_NUMBER: port,
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain(
      'already published by another Docker project'
    )
    const invocations = await commands(local.log)
    expect(invocations).not.toContain('"up"')
    expect(invocations).not.toContain('"exec"')
    await expect(
      readFile(join(local.directory, '.env.docker'))
    ).rejects.toThrow()
  }
)

test('un ancien projet Docker appartenant à un autre checkout ne peut pas être adopté', async () => {
  const local = await fixture()
  await writeFile(
    join(local.directory, '.env.docker'),
    `INSTANCE_NAME=boilerplate-v2\nINSTANCE_SECRET=${'a'.repeat(64)}\nLOCAL_AUTH_SECRET=${'b'.repeat(64)}\n`
  )
  const result = setup(local, {
    TEST_LEGACY_OWNER: 'present',
    TEST_COMPOSE_OWNER: '/another/checkout',
  })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('another checkout')
  expect(await commands(local.log)).not.toContain('"up"')
})
