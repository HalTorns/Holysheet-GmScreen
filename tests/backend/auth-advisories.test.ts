// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

import type { BetterAuthOptions } from 'better-auth/minimal'
import { expect, test } from 'vitest'

import { auth } from '../../convex/betterAuth/auth'
import { z } from '../../shared/zod'

const advisories = [
  'GHSA-965c-763c-88jm',
  'GHSA-q84f-53jg-9ppm',
  'GHSA-r4xp-prcw-77qf',
]

// L'instance de génération utilise le vrai buildAuthOptions et les plugins
// installés. Les tests existants ne protègent ni ces mitigations ni l'échéance.
test('les options réelles conservent les conditions de non-exposition des trois avis', () => {
  const options: BetterAuthOptions = auth.options
  const plugins = options.plugins ?? []
  expect(plugins.find((plugin) => plugin.id === 'magic-link')).toMatchObject({
    options: { storeToken: 'hashed' },
  })
  expect([undefined, 'plain']).toContain(options.verification?.storeIdentifier)
  const pluginIds = plugins.map((plugin) => plugin.id)
  expect(pluginIds).not.toContain('device-authorization')
  expect(pluginIds).not.toContain('oauth-proxy')
  expect(options.account?.accountLinking?.enabled).toBe(false)
})

test('le fichier de configuration et pnpm limitent les exceptions aux trois avis approuvés', () => {
  const root = fileURLToPath(new URL('../../', import.meta.url))
  const workspace = readFileSync(
    new URL('../../pnpm-workspace.yaml', import.meta.url),
    'utf-8'
  )
  expect(workspace.match(/GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}/g)).toEqual(
    advisories
  )
  // pnpm 11 normalise auditConfig.ignoreGhsas en audit.ignore à la lecture.
  // Son parseur contrôle aussi l'emplacement YAML, pas seulement les IDs.
  const configuration = z.object({ ignore: z.array(z.string()) }).parse(
    JSON.parse(
      execFileSync('pnpm', ['config', 'get', 'audit', '--json'], {
        cwd: root,
        encoding: 'utf-8',
        timeout: 10_000,
      })
    )
  )
  expect(configuration.ignore).toEqual(advisories)
})

test('l’exception reste dans sa période de validité', () => {
  expect(
    new Date().toISOString().slice(0, 10) <= '2026-11-30',
    'Réexaminer l’exception Better Auth : échéance du 2026-11-30 dépassée. Voir docs/upgrades.md (T0).'
  ).toBe(true)
})
