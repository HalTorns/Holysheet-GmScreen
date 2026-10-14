import { spawnSync } from 'node:child_process'

import {
  assertDockerPortsOwnership,
  assertLocalDeploymentSelection,
  backendUrl,
  dashboardUrl,
  prepareDockerEnvironment,
  readEnvironment,
  run,
} from './local-config.mjs'

try {
  assertLocalDeploymentSelection()
  if (!readEnvironment('.env.docker').COMPOSE_PROJECT_NAME)
    throw new Error('Exécuter pnpm setup avant d’ouvrir le dashboard.')
  const configuration = prepareDockerEnvironment()
  assertDockerPortsOwnership(configuration)
  const environment = readEnvironment('.env.local')
  if (
    environment.CONVEX_SELF_HOSTED_URL !== backendUrl ||
    !environment.CONVEX_SELF_HOSTED_ADMIN_KEY
  )
    throw new Error('La configuration locale est incomplète : pnpm setup.')
  const dashboard = await fetch(dashboardUrl, {
    signal: AbortSignal.timeout(5000),
  })
  if (!dashboard.ok)
    throw new Error('Le dashboard est indisponible : pnpm services:up.')
  const authentication = await fetch(`${backendUrl}/api/check_admin_key`, {
    headers: {
      Authorization: `Convex ${environment.CONVEX_SELF_HOSTED_ADMIN_KEY}`,
    },
    signal: AbortSignal.timeout(5000),
  })
  if (!authentication.ok)
    throw new Error('La clé locale ne correspond pas au backend actif.')

  if (process.platform === 'darwin') {
    const clipboard = spawnSync('pbcopy', [], {
      input: environment.CONVEX_SELF_HOSTED_ADMIN_KEY,
      stdio: ['pipe', 'ignore', 'ignore'],
      timeout: 5000,
    })
    if (clipboard.status !== 0)
      throw new Error('Impossible de copier la clé dans le presse-papiers.')
    run('open', [dashboardUrl], { capture: true })
    console.info(
      'Dashboard ouvert. Clé admin locale copiée : coller dans « Admin Key », puis « Log In ». Après connexion, remplacer le presse-papiers et se déconnecter après usage.'
    )
  } else {
    console.info(
      `Ouvrir ${dashboardUrl}. Copier manuellement CONVEX_SELF_HOSTED_ADMIN_KEY depuis .env.local dans « Admin Key ». Ne pas l’afficher dans le terminal.`
    )
  }
} catch (error) {
  console.error(
    error instanceof Error
      ? error.message
      : 'Ouverture du dashboard impossible.'
  )
  process.exitCode = 1
}
