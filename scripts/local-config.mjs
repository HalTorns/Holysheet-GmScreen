import { spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import {
  chmodSync,
  existsSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join } from 'node:path'
import { parseEnv } from 'node:util'

export const projectRoot = realpathSync(dirname(import.meta.dirname))
export const backendUrl = 'http://127.0.0.1:3210'
export const dashboardUrl = 'http://127.0.0.1:6791'
const cloudSelectors = [
  'CONVEX_DEPLOYMENT',
  'CONVEX_DEPLOY_KEY',
  'CONVEX_DEPLOYMENT_TOKEN',
]

export function readEnvironment(name) {
  const path = join(projectRoot, name)
  return existsSync(path) ? parseEnv(readFileSync(path, 'utf-8')) : {}
}

export function assertLocalDeploymentSelection() {
  for (const environment of [
    process.env,
    readEnvironment('.env'),
    readEnvironment('.env.local'),
  ]) {
    if (
      cloudSelectors.some((name) => environment[name]) ||
      (environment.CONVEX_SELF_HOSTED_URL &&
        environment.CONVEX_SELF_HOSTED_URL !== backendUrl)
    ) {
      throw new Error(
        'Existing remote Convex configuration found. Local setup will not replace it. Remove the cloud selector from this local checkout or shell first.'
      )
    }
  }
}

export function localDeploymentEnvironment(adminKey) {
  return {
    ...process.env,
    ...Object.fromEntries(cloudSelectors.map((name) => [name, ''])),
    CONVEX_SELF_HOSTED_URL: backendUrl,
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
    CONVEX_TELEMETRY_DISABLED: '1',
  }
}

export function run(
  program,
  arguments_,
  { capture = false, env = process.env, timeout = 180_000 } = {}
) {
  const result = spawnSync(program, arguments_, {
    cwd: projectRoot,
    env,
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    encoding: 'utf-8',
    timeout,
  })
  if (result.status !== 0)
    throw new Error(
      `${program} operation failed. Check installed tools, Docker availability and local port conflicts; private output was not printed.`
    )
  return result.stdout?.trim() ?? ''
}

export function writePrivateEnvironment(name, values) {
  const path = join(projectRoot, name)
  const temporary = `${path}.${randomBytes(6).toString('hex')}.tmp`
  const current = readEnvironment(name)
  let contents = existsSync(path) ? readFileSync(path, 'utf-8') : ''
  for (const [key, value] of Object.entries(values)) {
    if (current[key] === value) continue
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
      throw new Error('A local environment variable name is invalid.')
    const quote = ['"', "'", '`'].find(
      (candidate) => !value.includes(candidate)
    )
    if (!quote)
      throw new Error(
        'A managed environment value cannot be represented safely.'
      )
    const assignment = `${key}=${quote}${value}${quote}`
    // Existing custom assignments stay byte-for-byte intact, including comments,
    // Windows paths and multiline values; only managed changes are rewritten.
    const pattern = new RegExp(
      `(^|\\n)[ \\t]*(?:export[ \\t]+)?${key}[ \\t]*=[ \\t]*(?:"[^"]*"|'[^']*'|\u0060[^\u0060]*\u0060|[^\\n]*)(?:[ \\t]*[^\\n]*)`,
      'g'
    )
    if (Object.hasOwn(current, key))
      contents = contents.replace(
        pattern,
        (_, separator) => `${separator}${assignment}`
      )
    else
      contents += `${contents && !contents.endsWith('\n') ? '\n' : ''}${assignment}\n`
  }
  writeFileSync(temporary, contents, { mode: 0o600, flag: 'wx' })
  renameSync(temporary, path)
  chmodSync(path, 0o600)
}

function assertContainerOwnership(name) {
  const ids = run(
    'docker',
    [
      'ps',
      '-a',
      '--filter',
      `label=com.docker.compose.project=${name}`,
      '--format',
      '{{.ID}}',
    ],
    { capture: true }
  )
    .split('\n')
    .filter(Boolean)
  for (const id of ids) {
    const owner = run(
      'docker',
      [
        'inspect',
        '--format',
        '{{index .Config.Labels "com.docker.compose.project.working_dir"}}',
        id,
      ],
      { capture: true }
    )
    if (owner !== projectRoot)
      throw new Error(
        'This Docker project belongs to another checkout. Local services were not changed.'
      )
  }
  return ids.length > 0
}

export function prepareDockerEnvironment() {
  const current = readEnvironment('.env.docker')
  if (!Object.keys(current).length) {
    const name = `boilerplate-${randomBytes(6).toString('hex')}`
    const password = randomBytes(32).toString('hex')
    return {
      COMPOSE_PROJECT_NAME: name,
      LOCAL_PROJECT_DIRECTORY: projectRoot,
      INSTANCE_NAME: name,
      INSTANCE_SECRET: randomBytes(32).toString('hex'),
      LOCAL_AUTH_SECRET: randomBytes(48).toString('base64url'),
      LOCAL_POSTGRES_PASSWORD: password,
      LOCAL_POSTGRES_DATABASE: name.replaceAll('-', '_'),
      LOCAL_POSTGRES_URL: `postgresql://convex:${password}@postgres:5432`,
    }
  }
  if (
    !current.INSTANCE_NAME ||
    !/^[a-f0-9]{64}$/i.test(current.INSTANCE_SECRET ?? '') ||
    (current.LOCAL_AUTH_SECRET?.length ?? 0) < 32
  )
    throw new Error(
      'Local Docker secrets are incomplete. Preserve .env.docker with its existing volume; setup will not rotate them.'
    )
  if (
    current.LOCAL_PROJECT_DIRECTORY &&
    current.LOCAL_PROJECT_DIRECTORY !== projectRoot
  )
    throw new Error(
      'Local Docker configuration belongs to another checkout. Do not copy .env.docker between projects.'
    )
  if (current.COMPOSE_PROJECT_NAME) {
    if (
      current.LOCAL_PROJECT_DIRECTORY !== projectRoot ||
      !/^[a-z0-9][a-z0-9_-]+$/.test(current.COMPOSE_PROJECT_NAME)
    )
      throw new Error(
        'The local Docker project identity is invalid. No services were changed.'
      )
    assertContainerOwnership(current.COMPOSE_PROJECT_NAME)
    return current
  }
  // Preserve the original volume only when Docker attests this checkout owns it.
  const legacyOwned = assertContainerOwnership('boilerplate-v2')
  if (
    !legacyOwned &&
    run(
      'docker',
      [
        'volume',
        'ls',
        '--filter',
        'label=com.docker.compose.project=boilerplate-v2',
        '--format',
        '{{.Name}}',
      ],
      { capture: true }
    )
  )
    throw new Error(
      'An existing legacy Docker volume cannot be attributed to this checkout. No services were changed; recover its original project configuration before setup.'
    )
  return {
    ...current,
    COMPOSE_PROJECT_NAME: legacyOwned
      ? 'boilerplate-v2'
      : `boilerplate-${randomBytes(6).toString('hex')}`,
    LOCAL_PROJECT_DIRECTORY: projectRoot,
  }
}

export function composeArguments(configuration, arguments_) {
  return [
    'compose',
    ...(configuration.LOCAL_SPOTLIGHT_ENABLED === 'true'
      ? ['--profile', 'observability']
      : []),
    '--project-directory',
    projectRoot,
    '--file',
    join(projectRoot, 'docker-compose.yml'),
    '--env-file',
    join(projectRoot, '.env.docker'),
    '--project-name',
    configuration.COMPOSE_PROJECT_NAME,
    ...arguments_,
  ]
}

export function composeEnvironment(configuration) {
  return {
    ...process.env,
    COMPOSE_PROJECT_NAME: configuration.COMPOSE_PROJECT_NAME,
    LOCAL_POSTGRES_PASSWORD: configuration.LOCAL_POSTGRES_PASSWORD ?? '',
    LOCAL_POSTGRES_DATABASE:
      configuration.LOCAL_POSTGRES_DATABASE ?? 'convex_self_hosted',
    LOCAL_POSTGRES_URL: configuration.LOCAL_POSTGRES_URL ?? '',
    COMPOSE_FILE: '',
    COMPOSE_PROFILES: '',
  }
}

export function assertPostgresConfiguration(configuration) {
  if (!configuration.LOCAL_POSTGRES_URL)
    throw new Error(
      'Legacy SQLite storage found. Run pnpm storage:migrate during local maintenance before pnpm setup or services:up.'
    )
  if (
    !/^[a-f0-9]{64}$/.test(configuration.LOCAL_POSTGRES_PASSWORD ?? '') ||
    !/^[a-z][a-z0-9_]{0,62}$/.test(
      configuration.LOCAL_POSTGRES_DATABASE ?? ''
    ) ||
    configuration.LOCAL_POSTGRES_DATABASE !==
      configuration.INSTANCE_NAME.replaceAll('-', '_') ||
    configuration.LOCAL_POSTGRES_URL !==
      `postgresql://convex:${configuration.LOCAL_POSTGRES_PASSWORD}@postgres:5432`
  )
    throw new Error(
      'Invalid local PostgreSQL configuration; no services were changed.'
    )
}

export function assertDockerPortsOwnership(configuration) {
  for (const port of [
    '3210',
    '3211',
    '6791',
    '8025',
    ...(configuration.LOCAL_SPOTLIGHT_ENABLED === 'true' ? ['8969'] : []),
  ]) {
    const projects = run(
      'docker',
      [
        'ps',
        '--filter',
        `publish=${port}`,
        '--format',
        '{{.Label "com.docker.compose.project"}}',
      ],
      { capture: true }
    )
      .split('\n')
      .filter(Boolean)
    if (projects.some((name) => name !== configuration.COMPOSE_PROJECT_NAME))
      throw new Error(
        `Local port ${port} is already published by another Docker project. Stop that project's services before starting this checkout; no services were changed.`
      )
  }
}
