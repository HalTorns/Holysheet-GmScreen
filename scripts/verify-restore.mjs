import { execFile } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer } from 'node:net'
import { dirname, join } from 'node:path'
import { parseEnv, promisify } from 'node:util'

const projectRoot = dirname(import.meta.dirname)
const execute = promisify(execFile)
const controller = new AbortController()
const originalUmask = process.umask(0o077)
const runId = `${new Date().toISOString().replaceAll(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`
const containerName = `boilerplate-restore-${runId.toLowerCase()}`
const volumeName = `${containerName}-data`
const runDirectory = join(projectRoot, 'backups', runId)
const sourceArchive = join(runDirectory, 'source.zip')
const restoredArchive = join(runDirectory, 'restored.zip')
const dockerEnvironmentPath = join(runDirectory, 'docker.env')

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => controller.abort())
}

async function command(program, arguments_, options = {}) {
  try {
    const result = await execute(program, arguments_, {
      cwd: projectRoot,
      maxBuffer: 128 * 1024 * 1024,
      timeout: 180_000,
      signal: controller.signal,
      ...options,
    })
    return result.stdout
  } catch {
    // CLI errors may include imported documents, credentials or server logs.
    throw new Error(
      `${program} operation failed; no private output was printed.`
    )
  }
}

function deploymentEnvironment(url, adminKey) {
  return {
    ...process.env,
    CONVEX_DEPLOYMENT: '',
    CONVEX_DEPLOY_KEY: '',
    CONVEX_DEPLOYMENT_TOKEN: '',
    CONVEX_SELF_HOSTED_URL: url,
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
    CONVEX_TELEMETRY_DISABLED: '1',
  }
}

async function convex(arguments_, environment) {
  return await command('pnpm', ['exec', 'convex', ...arguments_], {
    env: environment,
  })
}

async function freePorts() {
  const servers = [createServer(), createServer()]
  try {
    return await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve, reject) => {
            server.once('error', reject)
            server.listen(0, '127.0.0.1', () => {
              const address = server.address()
              if (!address || typeof address === 'string') {
                reject(new Error('Could not allocate a loopback port.'))
                return
              }
              resolve(address.port)
            })
          })
      )
    )
  } finally {
    await Promise.all(
      servers.map(
        (server) =>
          new Promise((resolve) => {
            server.close(resolve)
          })
      )
    )
  }
}

async function waitForBackend(url) {
  const deadline = Date.now() + 90_000
  while (Date.now() < deadline) {
    controller.signal.throwIfAborted()
    try {
      const response = await fetch(`${url}/version`, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(2000)]),
      })
      if (response.ok) return
    } catch {
      controller.signal.throwIfAborted()
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 1000)
    })
  }
  throw new Error('The disposable backend did not become ready.')
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])])
    )
  }
  return value
}

function checksum(value) {
  return createHash('sha256').update(value).digest('hex')
}

async function archiveInventory(path) {
  const names = (await command('unzip', ['-Z1', path]))
    .split('\n')
    .filter((name) => name && !name.endsWith('/'))
  const tables = {}
  const files = {}
  for (const name of names) {
    if (name.endsWith('/documents.jsonl')) {
      // Table-number metadata belongs to each backend. Application IDs and
      // creation times remain in the comparison and must survive the import.
      if (
        name.endsWith('/_tables/documents.jsonl') ||
        name === '_tables/documents.jsonl'
      )
        continue
      const payload = await command('unzip', ['-p', path, name])
      let documents
      try {
        documents = payload
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.stringify(canonicalJson(JSON.parse(line))))
          .sort()
      } catch {
        throw new Error('A snapshot contains invalid JSON documents.')
      }
      tables[name.slice(0, -'/documents.jsonl'.length)] = {
        count: documents.length,
        checksum: checksum(documents.join('\n')),
      }
    } else if (name.includes('_storage/')) {
      const payload = await command('unzip', ['-p', path, name], {
        encoding: 'buffer',
      })
      files[name] = { bytes: payload.length, checksum: checksum(payload) }
    }
  }
  return { tables, files }
}

function compareInventories(source, restored) {
  for (const name of new Set([
    ...Object.keys(source.tables),
    ...Object.keys(restored.tables),
  ])) {
    const before = source.tables[name] ?? { count: 0, checksum: checksum('') }
    const after = restored.tables[name] ?? { count: 0, checksum: checksum('') }
    if (before.count !== after.count || before.checksum !== after.checksum) {
      throw new Error(`Restored table payload differs: ${name}.`)
    }
  }
  if (
    JSON.stringify(canonicalJson(source.files)) !==
    JSON.stringify(canonicalJson(restored.files))
  ) {
    throw new Error('Restored file-storage payload differs.')
  }
}

async function writePrivateFile(path, contents) {
  await writeFile(path, contents, { mode: 0o600, flag: 'wx' })
  await chmod(path, 0o600)
}

async function environmentFileChecksums() {
  const entries = await Promise.all(
    ['.env.local', '.env.docker'].map(async (name) => {
      try {
        return [name, checksum(await readFile(join(projectRoot, name)))]
      } catch (error) {
        if (error.code === 'ENOENT') return [name, null]
        throw new Error(`Cannot read ${name} for preservation verification.`, {
          cause: error,
        })
      }
    })
  )
  return Object.fromEntries(entries)
}

async function verifyRestore() {
  const startedAt = Date.now()
  const originalEnvironment = await environmentFileChecksums()
  const configuration = parseEnv(
    await readFile(join(projectRoot, '.env.local'), 'utf-8')
  )
  const sourceUrl = new URL(configuration.CONVEX_SELF_HOSTED_URL ?? '')
  const sourceKey = configuration.CONVEX_SELF_HOSTED_ADMIN_KEY
  if (
    sourceUrl.protocol !== 'http:' ||
    !['localhost', '127.0.0.1'].includes(sourceUrl.hostname) ||
    sourceUrl.pathname !== '/' ||
    sourceUrl.username ||
    sourceUrl.password ||
    sourceUrl.search ||
    sourceUrl.hash ||
    !sourceKey ||
    configuration.CONVEX_DEPLOYMENT
  ) {
    throw new Error(
      'Restore verification requires an explicit local source backend.'
    )
  }
  const compose = await readFile(
    join(projectRoot, 'docker-compose.yml'),
    'utf-8'
  )
  const image =
    /^\s+image:\s+(ghcr\.io\/get-convex\/convex-backend@sha256:[a-f0-9]{64})\s*$/m.exec(
      compose
    )?.[1]
  if (!image)
    throw new Error('The backend Docker image must be pinned by digest.')
  await mkdir(join(projectRoot, 'backups'), { mode: 0o700, recursive: true })
  await mkdir(runDirectory, { mode: 0o700 })
  const sourceEnvironment = deploymentEnvironment(sourceUrl.origin, sourceKey)
  console.info(
    'Exporting the local source, including components and file storage.'
  )
  await convex(
    ['export', '--include-file-storage', '--path', sourceArchive],
    sourceEnvironment
  )
  await chmod(sourceArchive, 0o600)
  const source = await archiveInventory(sourceArchive)
  if (
    Object.keys(source.tables).length === 0 ||
    !Object.keys(source.tables).some((name) =>
      name.endsWith('betterAuth/user')
    ) ||
    !Object.keys(source.tables).some((name) =>
      name.endsWith('betterAuth/passkey')
    )
  ) {
    throw new Error(
      'The source snapshot is missing tables or required auth-component tables.'
    )
  }
  let volumeCreated = false
  let containerCreated = false
  let report
  try {
    const [cloudPort, sitePort] = await freePorts()
    const targetUrl = `http://127.0.0.1:${cloudPort}`
    if (targetUrl === sourceUrl.origin) {
      throw new Error(
        'The disposable target must differ from the source backend.'
      )
    }
    await writePrivateFile(
      dockerEnvironmentPath,
      `${Object.entries({
        INSTANCE_NAME: containerName,
        INSTANCE_SECRET: randomBytes(32).toString('hex'),
        CONVEX_CLOUD_ORIGIN: targetUrl,
        CONVEX_SITE_ORIGIN: `http://127.0.0.1:${sitePort}`,
        DISABLE_BEACON: 'true',
        REDACT_LOGS_TO_CLIENT: 'true',
        RUST_LOG: 'warn',
      })
        .map(([name, value]) => `${name}=${value}`)
        .join('\n')}\n`
    )
    await command('docker', ['volume', 'create', volumeName])
    volumeCreated = true
    await command('docker', [
      'create',
      '--name',
      containerName,
      '--env-file',
      dockerEnvironmentPath,
      '-p',
      `127.0.0.1:${cloudPort}:3210`,
      '-p',
      `127.0.0.1:${sitePort}:3211`,
      '-v',
      `${volumeName}:/convex/data`,
      image,
    ])
    containerCreated = true
    await command('docker', ['start', containerName])
    console.info('Deploying the same code to a fresh disposable backend.')
    await waitForBackend(targetUrl)
    const targetKey = (
      await command('docker', [
        'exec',
        containerName,
        './generate_admin_key.sh',
      ])
    ).trim()
    if (!targetKey || targetKey.includes('\n')) {
      throw new Error('The disposable backend returned an invalid admin key.')
    }
    const targetEnvironment = deploymentEnvironment(targetUrl, targetKey)
    // No main .env file or generated source is rewritten by this deployment.
    await convex(
      ['deploy', '--codegen', 'disable', '--typecheck', 'disable'],
      targetEnvironment
    )
    console.info('Importing and re-exporting only the disposable backend.')
    await convex(['import', sourceArchive, '--yes'], targetEnvironment)
    await convex(
      ['export', '--include-file-storage', '--path', restoredArchive],
      targetEnvironment
    )
    await chmod(restoredArchive, 0o600)
    const restored = await archiveInventory(restoredArchive)
    compareInventories(source, restored)
    report = {
      result: 'passed',
      completedAt: new Date().toISOString(),
      durationMs: Date.now() - startedAt,
      backendImage: image,
      tables: Object.fromEntries(
        Object.entries(source.tables).map(([name, table]) => [
          name,
          table.count,
        ])
      ),
      fileStorage: {
        files: Object.keys(source.files).length,
        nonEmptyPayloadVerified: Object.keys(source.files).length > 0,
        bytes: Object.values(source.files).reduce(
          (total, file) => total + file.bytes,
          0
        ),
      },
      verification:
        'Exact canonical document payloads, retained IDs/creation times, file checksums; excludes _tables metadata.',
      limits:
        'Does not verify reconnection, private authenticator keys, RP/origin compatibility, environment secrets, pending scheduled functions, or off-host durability.',
    }
  } finally {
    // Names refer only to this run's newly-created disposable resources.
    const failures = []
    if (containerCreated) {
      try {
        await command('docker', ['rm', '-f', containerName], {
          signal: undefined,
        })
      } catch {
        failures.push('container')
      }
    }
    if (volumeCreated) {
      try {
        await command('docker', ['volume', 'rm', volumeName], {
          signal: undefined,
        })
      } catch {
        failures.push('volume')
      }
    }
    await rm(dockerEnvironmentPath, { force: true })
    if (failures.length) {
      // Cleanup failure must supersede the result so no successful report is emitted.
      // eslint-disable-next-line no-unsafe-finally
      throw new Error(
        `Disposable cleanup failed for ${failures.join(' and ')}; names start with ${containerName}.`
      )
    }
    if (
      JSON.stringify(originalEnvironment) !==
      JSON.stringify(await environmentFileChecksums())
    ) {
      // Preservation failure must prevent reporting a successful restoration.
      // eslint-disable-next-line no-unsafe-finally
      throw new Error(
        'Main environment files changed during restore verification.'
      )
    }
  }
  report.completedAt = new Date().toISOString()
  report.durationMs = Date.now() - startedAt
  report.disposableResourcesRemoved = true
  report.mainEnvironmentFilesPreserved = true
  await writePrivateFile(
    join(runDirectory, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`
  )
  console.info(
    `Restore verified: ${Object.keys(report.tables).length} tables and ${report.fileStorage.files} stored files. Report: backups/${runId}/report.json. Disposable container and volume removed.`
  )
}

verifyRestore()
  .catch((error) => {
    console.error(
      error instanceof Error ? error.message : 'Restore verification failed.'
    )
    process.exitCode = 1
  })
  .finally(() => process.umask(originalUmask))
