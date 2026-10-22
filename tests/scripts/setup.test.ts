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
  realpath,
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'

import { z } from '@shared/zod'
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
appendFileSync(process.env.TEST_COMMAND_LOG, JSON.stringify({ program: process.argv[1].split('/').at(-1), args, cloudSelected: Boolean(process.env.CONVEX_DEPLOY_KEY || process.env.CONVEX_DEPLOYMENT_TOKEN || process.env.CONVEX_DEPLOYMENT), localUrl: process.env.CONVEX_SELF_HOSTED_URL, expectedOrganizations: process.env.PLAYWRIGHT_EXPECT_ORGANIZATIONS }) + '\n')
if (args.includes('./generate_admin_key.sh')) console.log('development-only-fake-key')
if (args.includes('ps') && args.includes('-a') && process.env.TEST_LEGACY_OWNER) console.log('development-only-container-id')
const bindings = process.env.TEST_PORT_BINDINGS ? JSON.parse(process.env.TEST_PORT_BINDINGS) : process.env.TEST_PORT_PROJECT ? [{ id: 'port-container', containerPort: process.env.TEST_PORT_NUMBER, hostPort: process.env.TEST_PORT_NUMBER, project: process.env.TEST_PORT_PROJECT }] : []
if (args[0] === 'ps' && !args.includes('-a')) {
  for (const binding of bindings) {
    const filter = args.find(arg => arg.startsWith('publish='))
    // Docker's publish filter matches the container port, NOT the host port.
    if (!filter || filter === 'publish=' + binding.containerPort) console.log(args.some(arg => arg.includes('.Label')) ? binding.project : binding.id)
  }
}
if (args.includes('inspect')) {
  if (args.some(arg => arg.includes('.NetworkSettings.Ports'))) {
    for (const binding of bindings.filter(entry => args.includes(entry.id))) console.log(JSON.stringify({ project: binding.project, ports: { [binding.containerPort + '/tcp']: [{ HostIp: '127.0.0.1', HostPort: binding.hostPort }] } }))
  } else console.log(process.env.TEST_COMPOSE_OWNER || process.cwd())
}
`
  await Promise.all(
    ['docker', 'pnpm', 'convex'].map((name) =>
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

async function backendCommand(
  local: Awaited<ReturnType<typeof fixture>>,
  mode: 'dev' | 'push',
  environment: Record<string, string> = {},
  args: string[] = []
) {
  const manifest = z
    .object({ scripts: z.record(z.string(), z.string()) })
    .parse(
      JSON.parse(await readFile(join(projectRoot, 'package.json'), 'utf-8'))
    )
  const script = manifest.scripts[`backend:${mode}`]
  if (!script) throw new Error('Missing backend command')
  // Execute the actual package script; only external Docker/CLI processes are fake.
  return spawnSync(
    '/bin/sh',
    ['-c', `${script} "$@"`, 'backend-test', ...args],
    {
      cwd: local.directory,
      env: { ...local.environment, ...environment },
      encoding: 'utf-8',
      timeout: 5000,
    }
  )
}

test.each(['dev', 'push'] as const)(
  'backend:%s refuses inherited remote selectors before invoking Convex',
  async (mode) => {
    const local = await fixture()
    expect(setup(local).status).toBe(0)
    await writeFile(local.log, '')
    const result = await backendCommand(local, mode, {
      CONVEX_DEPLOY_KEY: 'development-only-remote-selection',
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('remote Convex configuration')
    expect(await commands(local.log)).toBe('')
  }
)

test.each(['dev', 'push'] as const)(
  'backend:%s pins the owned local deployment and rejects target overrides',
  async (mode) => {
    const local = await fixture()
    expect(setup(local).status).toBe(0)
    await writeFile(local.log, '')
    const rejected = await backendCommand(local, mode, {}, ['--prod'])
    expect(rejected.status).toBe(1)
    expect(await commands(local.log)).toBe('')
    const accepted = await backendCommand(local, mode)
    expect(accepted.status, accepted.stderr).toBe(0)
    const invocations = (await commands(local.log))
      .split('\n')
      .filter(Boolean)
      .map((line) =>
        z
          .object({
            args: z.array(z.string()),
            localUrl: z.string().optional(),
            cloudSelected: z.boolean(),
          })
          .parse(JSON.parse(line))
      )
    const invocation = invocations.find(({ args: commandArgs }) =>
      commandArgs.includes('convex')
    )
    expect(invocation).toMatchObject({
      localUrl: 'http://127.0.0.1:3210',
      cloudSelected: false,
    })
    expect(invocation?.args).toEqual([
      'exec',
      'convex',
      'dev',
      ...(mode === 'push' ? ['--once'] : []),
      '--env-file',
      join(await realpath(local.directory), '.env.local'),
    ])
  }
)

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
  expect(before.LOCAL_POSTGRES_PASSWORD !== after.LOCAL_POSTGRES_PASSWORD).toBe(
    true
  )
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

test.each([
  'test-organizations.mjs',
  'dashboard.mjs',
  'migrate-postgres.mjs',
  'backend-local.mjs',
])(
  'le lanceur %s refuse un checkout copié avant tout accès privé',
  async (script) => {
    const original = await fixture()
    expect(setup(original).status).toBe(0)
    const copy = await fixture()
    for (const name of ['.env.docker', '.env.local'])
      await copyFile(join(original.directory, name), join(copy.directory, name))
    const result = spawnSync(
      process.execPath,
      [
        join(copy.directory, 'scripts', script),
        ...(script === 'backend-local.mjs' ? ['push'] : []),
      ],
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

test('un checkout SQLite existant exige une migration explicite et conserve sa configuration', async () => {
  const local = await fixture()
  const legacy = `COMPOSE_PROJECT_NAME=local-project\nLOCAL_PROJECT_DIRECTORY=${await realpath(local.directory)}\nINSTANCE_NAME=local-project\nINSTANCE_SECRET=${'a'.repeat(64)}\nLOCAL_AUTH_SECRET=${'b'.repeat(64)}\n`
  await writeFile(join(local.directory, '.env.docker'), legacy)
  const result = setup(local)
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('pnpm storage:migrate')
  expect(await commands(local.log)).not.toContain('"up"')
  expect(await readFile(join(local.directory, '.env.docker'), 'utf-8')).toBe(
    legacy
  )
})

test('le lanceur E2E local ne transmet pas une attente de mode vide ou héritée', async () => {
  const local = await fixture()
  expect(setup(local).status).toBe(0)
  const result = spawnSync(
    process.execPath,
    [join(local.directory, 'scripts/test-local.mjs')],
    {
      cwd: local.directory,
      env: { ...local.environment, PLAYWRIGHT_EXPECT_ORGANIZATIONS: 'true' },
      encoding: 'utf-8',
      timeout: 5000,
    }
  )
  expect(result.status, result.stderr).toBe(0)
  const invocationSchema = z.object({
    args: z.array(z.string()),
    expectedOrganizations: z.string().optional(),
  })
  const invocations = (await commands(local.log))
    .split('\n')
    .filter(Boolean)
    .map((line) => invocationSchema.parse(JSON.parse(line)))
  const browserRun = invocations.find((entry) =>
    entry.args.includes('test:e2e')
  )
  expect(browserRun).toBeDefined()
  expect(browserRun?.expectedOrganizations).toBeUndefined()
})

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

// Setup owns host configuration and CLI targeting. Real E2E owns Docker/JWKS.
test('custom host ports survive setup reruns and reach the local CLI', async () => {
  const local = await fixture()
  const ports = {
    LOCAL_APP_PORT: '3400',
    LOCAL_CONVEX_PORT: '3410',
    LOCAL_CONVEX_SITE_PORT: '3411',
    LOCAL_DASHBOARD_PORT: '6991',
    LOCAL_MAILPIT_PORT: '8225',
    LOCAL_SPOTLIGHT_PORT: '9169',
  }
  expect(setup(local, ports).status).toBe(0)
  const configuration = parseEnv(
    await readFile(join(local.directory, '.env.local'), 'utf-8')
  )
  expect(configuration).toMatchObject({
    VITE_SITE_URL: 'http://localhost:3400',
    VITE_CONVEX_URL: 'http://127.0.0.1:3410',
    VITE_CONVEX_SITE_URL: 'http://127.0.0.1:3411',
    CONVEX_SELF_HOSTED_URL: 'http://127.0.0.1:3410',
  })
  expect(setup(local).status).toBe(0)
  expect(
    parseEnv(await readFile(join(local.directory, '.env.docker'), 'utf-8'))
  ).toMatchObject(ports)
  expect((await backendCommand(local, 'push')).status).toBe(0)
  expect(await commands(local.log)).toContain(
    '"localUrl":"http://127.0.0.1:3410"'
  )
})

test.each([
  { LOCAL_CONVEX_PORT: '0' },
  { LOCAL_CONVEX_PORT: '65536' },
  { LOCAL_CONVEX_SITE_PORT: '3311oops' },
  { LOCAL_APP_PORT: '3.5' },
  { LOCAL_MAILPIT_PORT: '3210' },
])(
  'invalid host ports fail before Docker or configuration writes (%j)',
  async (ports) => {
    const local = await fixture()
    const result = setup(local, ports)
    expect(result.status).toBe(1)
    expect(result.stderr).toMatch(/local port|host ports/)
    expect(await commands(local.log)).toBe('')
    await expect(
      readFile(join(local.directory, '.env.docker'))
    ).rejects.toThrow()
  }
)

// These bindings exercise the Docker protocol the old publish filter confused.
test.each(['another-checkout', ''])(
  'a custom host port conflict fails before writes (Docker project %j)',
  async (project) => {
    const local = await fixture()
    const result = setup(local, {
      LOCAL_CONVEX_PORT: '3410',
      TEST_PORT_BINDINGS: JSON.stringify([
        { id: 'occupied', containerPort: '3210', hostPort: '3410', project },
      ]),
    })
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('Local port 3410 is already published')
    expect(await commands(local.log)).not.toContain('"up"')
    await expect(
      readFile(join(local.directory, '.env.docker'))
    ).rejects.toThrow()
  }
)

test('two checkouts sharing container ports can use distinct host ports', async () => {
  const local = await fixture()
  const result = setup(local, {
    TEST_PORT_BINDINGS: JSON.stringify([
      {
        id: 'separate',
        containerPort: '3210',
        hostPort: '3510',
        project: 'another-checkout',
      },
    ]),
  })
  expect(result.status, result.stderr).toBe(0)
})

test('a checkout can reuse its own published host port', async () => {
  const local = await fixture()
  expect(setup(local).status).toBe(0)
  const configuration = parseEnv(
    await readFile(join(local.directory, '.env.docker'), 'utf-8')
  )
  const result = setup(local, {
    TEST_PORT_BINDINGS: JSON.stringify([
      {
        id: 'owned',
        containerPort: '3210',
        hostPort: '3210',
        project: configuration.COMPOSE_PROJECT_NAME,
      },
    ]),
  })
  expect(result.status, result.stderr).toBe(0)
})

test('an inherited port cannot silently retarget an established checkout', async () => {
  const local = await fixture()
  expect(setup(local).status).toBe(0)
  const original = await readFile(join(local.directory, '.env.docker'), 'utf-8')
  await writeFile(local.log, '')
  const result = setup(local, { LOCAL_CONVEX_PORT: '3410' })
  expect(result.status).toBe(1)
  expect(result.stderr).toContain('Conflicting local port')
  expect(await commands(local.log)).toBe('')
  expect(await readFile(join(local.directory, '.env.docker'), 'utf-8')).toBe(
    original
  )
})
