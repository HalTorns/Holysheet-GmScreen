import {
  assertDockerPortsOwnership,
  composeArguments,
  composeEnvironment,
  prepareDockerEnvironment,
  readEnvironment,
  run,
  writePrivateEnvironment,
} from './local-config.mjs'

try {
  const action = process.argv[2]
  if (!['up', 'down', 'status'].includes(action))
    throw new Error('Use services up, down or status.')
  if (!readEnvironment('.env.docker').COMPOSE_PROJECT_NAME)
    throw new Error(
      'Run pnpm setup once to establish this checkout’s local Docker identity.'
    )
  const configuration = prepareDockerEnvironment()
  if (process.argv.includes('--spotlight')) {
    if (action !== 'up')
      throw new Error(
        'Use services:up --spotlight to enable local observability.'
      )
    configuration.LOCAL_SPOTLIGHT_ENABLED = 'true'
    assertDockerPortsOwnership(configuration)
    writePrivateEnvironment('.env.docker', { LOCAL_SPOTLIGHT_ENABLED: 'true' })
    writePrivateEnvironment('.env.local', {
      VITE_SPOTLIGHT_ENABLED: 'true',
      SPOTLIGHT_ENABLED: 'true',
    })
  }
  if (action === 'up') assertDockerPortsOwnership(configuration)
  const arguments_ =
    action === 'up'
      ? ['up', '-d', '--wait']
      : action === 'down'
        ? ['down']
        : ['ps']
  run('docker', composeArguments(configuration, arguments_), {
    env: composeEnvironment(configuration),
  })
} catch (error) {
  console.error(
    error instanceof Error ? error.message : 'Local services operation failed.'
  )
  process.exitCode = 1
}
