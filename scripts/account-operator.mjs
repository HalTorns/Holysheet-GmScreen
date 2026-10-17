import { ConvexHttpClient } from 'convex/browser'

import { internal } from '../convex/_generated/api.js'
import {
  assertLocalDeploymentSelection,
  assertDockerPortsOwnership,
  prepareDockerEnvironment,
  readEnvironment,
} from './local-config.mjs'

assertLocalDeploymentSelection()
assertDockerPortsOwnership(prepareDockerEnvironment())
const configuration = readEnvironment('.env.local')
if (!configuration.CONVEX_SELF_HOSTED_ADMIN_KEY)
  throw new Error('Configuration opérateur locale manquante.')
const client = new ConvexHttpClient('http://127.0.0.1:3210')
client.setAdminAuth(configuration.CONVEX_SELF_HOSTED_ADMIN_KEY)
const command = process.argv[2]
if (command === 'grant') {
  const userId = process.argv[3]
  if (!userId || !/^[a-zA-Z0-9_-]{1,128}$/.test(userId))
    throw new Error('Usage : pnpm admin:grant ID_COMPTE')
  await client.mutation(internal.userAdmin.grant, { userId })
  console.log('Rôle admin attribué et journalisé. Accès : /app/users.')
} else if (command === 'profiles') {
  let cursor = null
  const totals = { scanned: 0, claimed: 0, conflicts: 0, incomplete: 0 }
  let done = false
  while (!done) {
    const result = await client.mutation(internal.profileNames.backfill, {
      cursor,
    })
    for (const key of Object.keys(totals)) totals[key] += result[key]
    done = result.isDone
    cursor = result.cursor
  }
  console.log(JSON.stringify(totals))
} else throw new Error('Commande opérateur inconnue.')
