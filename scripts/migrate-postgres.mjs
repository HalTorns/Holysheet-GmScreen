import { randomBytes } from 'node:crypto'
import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  assertDockerPortsOwnership,
  assertLocalDeploymentSelection,
  assertPostgresConfiguration,
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
import { archiveInventory, compareInventories } from './snapshots.mjs'

// Run with local writers stopped. An existing PostgreSQL database is never imported over.
const originalUmask = process.umask(0o077)
async function migrate() {
  assertLocalDeploymentSelection()
  const original = prepareDockerEnvironment()
  assertDockerPortsOwnership(original)
  if (original.LOCAL_POSTGRES_URL) {
    assertPostgresConfiguration(original)
    console.info('PostgreSQL is already configured. No migration performed.')
    return
  }
  const frontend = readEnvironment('.env.local')
  const key = frontend.CONVEX_SELF_HOSTED_ADMIN_KEY
  if (!key || frontend.CONVEX_SELF_HOSTED_URL !== backendUrl)
    throw new Error('An initialized local SQLite backend is required.')
  const password =
    original.LOCAL_POSTGRES_PASSWORD ?? randomBytes(32).toString('hex')
  const configuration = {
    ...original,
    LOCAL_POSTGRES_PASSWORD: password,
    LOCAL_POSTGRES_DATABASE: original.INSTANCE_NAME.replaceAll('-', '_'),
    LOCAL_POSTGRES_URL: '',
  }
  const target = {
    ...configuration,
    LOCAL_POSTGRES_URL: `postgresql://convex:${password}@postgres:5432`,
  }
  assertPostgresConfiguration(target)
  const id = `postgres-migration-${new Date().toISOString().replaceAll(/[:.]/g, '-')}`
  const directory = join(projectRoot, 'backups', id)
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  copyFileSync(
    join(projectRoot, '.env.docker'),
    join(directory, 'source-docker.env')
  )
  chmodSync(join(directory, 'source-docker.env'), 0o600)
  const environment = localDeploymentEnvironment(key)
  const convex = (args) =>
    run('pnpm', ['exec', 'convex', ...args], {
      capture: true,
      env: environment,
    })
  const compose = (config, args) =>
    run('docker', composeArguments(config, args), {
      capture: true,
      env: composeEnvironment(config),
    })
  const query = await fetch(`${backendUrl}/api/query`, {
    method: 'POST',
    headers: {
      Authorization: `Convex ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      path: '_system/cli/queryEnvironmentVariables',
      args: {},
      format: 'json',
    }),
    signal: AbortSignal.timeout(10_000),
  })
  const variables = await query.json()
  if (
    !query.ok ||
    variables.status !== 'success' ||
    !Array.isArray(variables.value)
  )
    throw new Error(
      'Could not preserve backend environment; private output omitted.'
    )
  writeFileSync(
    join(directory, 'backend-environment.json'),
    JSON.stringify(variables.value),
    { mode: 0o600, flag: 'wx' }
  )
  const archive = join(directory, 'source.zip')
  console.info(
    'Exporting local SQLite data, components and file storage to a private backup.'
  )
  convex(['export', '--include-file-storage', '--path', archive])
  chmodSync(archive, 0o600)
  const source = await archiveInventory(archive)
  if (
    !Object.keys(source.tables).some((name) =>
      name.endsWith('betterAuth/user')
    ) ||
    !Object.keys(source.tables).some((name) =>
      name.endsWith('betterAuth/passkey')
    )
  )
    throw new Error(
      'The backup is missing auth component tables; SQLite remains selected.'
    )
  writePrivateEnvironment('.env.docker', configuration)
  compose(configuration, ['up', '-d', '--wait', 'postgres'])
  const tables = compose(configuration, [
    'exec',
    '-T',
    'postgres',
    'psql',
    '-U',
    'convex',
    '-d',
    configuration.LOCAL_POSTGRES_DATABASE,
    '-Atc',
    "SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public'",
  ])
  if (tables !== '0')
    throw new Error(
      'PostgreSQL is not empty. Source remains on SQLite; no import performed.'
    )
  let switched = false
  try {
    // Keep the SQLite volume in place for rollback; only the database driver changes.
    compose(configuration, ['stop', 'backend'])
    writePrivateEnvironment('.env.docker', target)
    switched = true
    compose(target, ['up', '-d', '--wait', 'backend'])
    const response = await fetch(
      `${backendUrl}/api/update_environment_variables`,
      {
        method: 'POST',
        headers: {
          Authorization: `Convex ${key}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          changes: variables.value.map(({ name, value }) => ({ name, value })),
        }),
        signal: AbortSignal.timeout(10_000),
      }
    )
    if (!response.ok) throw new Error('Backend environment restoration failed.')
    convex(['deploy', '--codegen', 'disable', '--typecheck', 'disable'])
    convex(['import', archive, '--yes'])
    const restored = join(directory, 'restored.zip')
    convex(['export', '--include-file-storage', '--path', restored])
    chmodSync(restored, 0o600)
    compareInventories(source, await archiveInventory(restored))
    const report = {
      result: 'passed',
      completedAt: new Date().toISOString(),
      engine: 'PostgreSQL 18',
      tables: Object.fromEntries(
        Object.entries(source.tables).map(([name, table]) => [
          name,
          table.count,
        ])
      ),
      storedFiles: Object.keys(source.files).length,
      sqliteVolumePreserved: true,
      verification:
        'Canonical documents, IDs, creation times and stored file checksums match.',
      limits:
        'Pending scheduled functions are not transferred by Convex export. Run authentication and business E2E after migration.',
    }
    writeFileSync(
      join(directory, 'report.json'),
      `${JSON.stringify(report, null, 2)}\n`,
      { mode: 0o600, flag: 'wx' }
    )
    console.info(
      `PostgreSQL migration verified: ${Object.keys(source.tables).length} tables. Backup and report: backups/${id}/. SQLite volume preserved.`
    )
  } catch {
    if (switched) {
      writePrivateEnvironment('.env.docker', configuration)
      compose(configuration, ['up', '-d', '--wait', 'backend'])
    }
    throw new Error(
      `Migration failed; SQLite configuration restored. Private recovery files: backups/${id}/. PostgreSQL was retained for inspection; no data was reset.`
    )
  }
}

void migrate()
  .catch((error) => {
    console.error(
      error instanceof Error
        ? error.message
        : 'Local migration failed; private output omitted.'
    )
    process.exitCode = 1
  })
  .finally(() => process.umask(originalUmask))
