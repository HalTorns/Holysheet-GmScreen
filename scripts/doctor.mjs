import { spawnSync } from 'node:child_process'
import { statSync } from 'node:fs'
import { join } from 'node:path'

import {
  assertLocalDeploymentSelection,
  assertPostgresConfiguration,
  backendUrl,
  backendSiteUrl,
  siteUrl,
  spotlightUrl,
  dashboardUrl,
  composeArguments,
  composeEnvironment,
  prepareDockerEnvironment,
  projectRoot,
  readEnvironment,
  run,
} from './local-config.mjs'

let failed = false
function check(name, inspect) {
  try {
    inspect()
    console.info(`OK — ${name}`)
  } catch (error) {
    failed = true
    console.error(
      `ÉCHEC — ${name}: ${error instanceof Error ? error.message : 'vérification impossible'}`
    )
  }
}

check('Runtime Node compatible', () => {
  const [major = 0, minor = 0] = process.versions.node.split('.').map(Number)
  if (major < 24 || (major === 24 && minor < 5) || major >= 27)
    throw new Error('Utiliser Node >=24.5 <27, recommandé 26.11.1.')
})
check('pnpm verrouillé', () => {
  if (run('pnpm', ['--version'], { capture: true }) !== '11.8.0')
    throw new Error('Utiliser pnpm 11.8.0.')
})
check('Sélection Convex exclusivement locale', assertLocalDeploymentSelection)
for (const name of ['.env.local', '.env.docker']) {
  check(`${name} privé et ignoré par Git`, () => {
    if ((statSync(join(projectRoot, name)).mode & 0o777) !== 0o600)
      throw new Error(
        'Le fichier doit appartenir uniquement au propriétaire (chmod 600).'
      )
    const result = spawnSync('git', ['check-ignore', '-q', name], {
      cwd: projectRoot,
      stdio: 'ignore',
    })
    if (result.status !== 0)
      throw new Error('Le fichier doit être ignoré par Git.')
  })
}
check('URLs frontend et CLI locales cohérentes', () => {
  const environment = readEnvironment('.env.local')
  if (
    environment.VITE_SITE_URL !== siteUrl ||
    environment.VITE_CONVEX_URL !== backendUrl ||
    environment.VITE_CONVEX_SITE_URL !== backendSiteUrl ||
    environment.CONVEX_SELF_HOSTED_URL !== backendUrl ||
    !environment.CONVEX_SELF_HOSTED_ADMIN_KEY
  )
    throw new Error('Exécuter pnpm setup dans un checkout local dédié.')
})
check('Identité Docker du checkout et services sains', () => {
  if (!readEnvironment('.env.docker').COMPOSE_PROJECT_NAME)
    throw new Error(
      'Exécuter pnpm setup pour établir une identité Docker locale.'
    )
  const configuration = prepareDockerEnvironment()
  assertPostgresConfiguration(configuration)
  const output = run(
    'docker',
    composeArguments(configuration, ['ps', '--format', 'json']),
    { capture: true, env: composeEnvironment(configuration) }
  )
  const containers = output.trim().startsWith('[')
    ? JSON.parse(output)
    : output
        .split('\n')
        .filter(Boolean)
        .map((line) => JSON.parse(line))
  for (const service of [
    'backend',
    'postgres',
    'dashboard',
    'mailpit',
    ...(configuration.LOCAL_SPOTLIGHT_ENABLED === 'true' ? ['spotlight'] : []),
  ]) {
    if (
      !containers.some(
        (container) =>
          container.Service === service &&
          container.State === 'running' &&
          container.Health === 'healthy'
      )
    )
      throw new Error(
        `Le service ${service} doit être démarré et sain (pnpm services:up).`
      )
  }
})
check('PostgreSQL 18 et pilote PostgreSQL du backend', () => {
  const configuration = prepareDockerEnvironment()
  assertPostgresConfiguration(configuration)
  const output = run(
    'docker',
    composeArguments(configuration, [
      'exec',
      '-T',
      'postgres',
      'psql',
      '-U',
      'convex',
      '-d',
      configuration.LOCAL_POSTGRES_DATABASE,
      '-Atc',
      "SELECT current_setting('server_version_num')::int >= 180000 AND current_setting('server_version_num')::int < 190000;",
    ]),
    { capture: true, env: composeEnvironment(configuration) }
  )
  if (output !== 't') throw new Error('Le serveur doit utiliser PostgreSQL 18.')
  // Idle PostgreSQL pools may close every connection. Inspect only the driver
  // argument, keeping credentials in the process arguments out of the output.
  const driver = run(
    'docker',
    composeArguments(configuration, [
      'exec',
      '-T',
      'backend',
      'sh',
      '-c',
      "tr '\\000' '\\n' < /proc/1/cmdline | grep -Fx postgres-v5",
    ]),
    { capture: true, env: composeEnvironment(configuration) }
  )
  if (driver !== 'postgres-v5')
    throw new Error('Le backend doit utiliser le pilote PostgreSQL.')
})
for (const [name, url] of [
  ['API Convex', `${backendUrl}/version`],
  ['Dashboard Convex', dashboardUrl],
  ...(readEnvironment('.env.docker').LOCAL_SPOTLIGHT_ENABLED === 'true'
    ? [['Spotlight', spotlightUrl]]
    : []),
]) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(2000),
    })
    if (!response.ok) throw new Error('HTTP indisponible')
    console.info(`OK — ${name} local joignable`)
  } catch {
    failed = true
    console.error(`ÉCHEC — ${name} local: exécuter pnpm services:up.`)
  }
}
console.info(
  'Diagnostic local en lecture seule terminé. Aucune valeur de secret affichée.'
)
process.exitCode = failed ? 1 : 0
