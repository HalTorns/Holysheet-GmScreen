// @vitest-environment node
import { readFileSync } from 'node:fs'

import type { BetterAuthOptions } from 'better-auth/minimal'
import { afterEach, expect, test, vi } from 'vitest'

import { createAuth } from '../../convex/auth'
import { createBackendTest } from './fixtures'

const advisories = [
  'GHSA-965c-763c-88jm',
  'GHSA-q84f-53jg-9ppm',
  'GHSA-r4xp-prcw-77qf',
]

afterEach(() => vi.unstubAllEnvs())

function configureEnvironment(passwordOnly: boolean) {
  const environment = {
    SITE_URL: 'http://localhost:3000',
    PASSKEY_RP_ID: 'localhost',
    BETTER_AUTH_SECRET: 'synthetic-advisory-fixture-secret-only',
    AUTH_EMAIL_PROVIDER: 'mailpit',
    AUTH_EMAIL_FROM: 'fixture@example.test',
    MAILPIT_URL: 'http://127.0.0.1:8025',
    AUTH_PASSWORD_ONLY: String(passwordOnly),
    AUTH_CREDENTIALS_ENABLED: 'true',
    AUTH_MAGIC_LINK_ENABLED: String(!passwordOnly),
    AUTH_GOOGLE_ENABLED: String(!passwordOnly),
    AUTH_GITHUB_ENABLED: String(!passwordOnly),
    GOOGLE_CLIENT_ID: 'synthetic-google-client',
    GOOGLE_CLIENT_SECRET: 'synthetic-google-secret',
    GITHUB_CLIENT_ID: 'synthetic-github-client',
    GITHUB_CLIENT_SECRET: 'synthetic-github-secret',
    AUTH_MFA_ENABLED: 'false',
    AUTH_ADMIN_ENABLED: 'false',
    ADMIN_USER_IDS: '',
    AUTH_PROXY_REQUIRED: 'false',
    AUTH_PROXY_SECRET: '',
  }
  for (const [name, value] of Object.entries(environment))
    vi.stubEnv(name, value)
}

function assertAdvisoryConditions(options: BetterAuthOptions) {
  const plugins = options.plugins ?? []
  expect(plugins.find((plugin) => plugin.id === 'magic-link')).toMatchObject({
    options: { storeToken: 'hashed' },
  })
  expect([undefined, 'plain']).toContain(options.verification?.storeIdentifier)
  const pluginIds = plugins.map((plugin) => plugin.id)
  expect(pluginIds).not.toContain('device-authorization')
  expect(pluginIds).not.toContain('oauth-proxy')
  expect(options.account?.accountLinking?.enabled).toBe(false)
}

// Le garde suit createAuth jusqu'à l'assemblage final des plugins, avec les
// réglages et modules validés depuis l'environnement, contrairement au schéma.
test.each([true, false])(
  'la fabrique de production conserve les mitigations (password-only : %s)',
  async (passwordOnly) => {
    configureEnvironment(passwordOnly)
    const backend = createBackendTest()
    await backend.action((ctx) => {
      const options: BetterAuthOptions = createAuth(ctx).options
      assertAdvisoryConditions(options)
      expect(Object.keys(options.socialProviders ?? {}).sort()).toEqual(
        passwordOnly ? [] : ['github', 'google']
      )
      expect(options.emailAndPassword?.enabled).toBe(true)
      expect(options.plugins?.map((plugin) => plugin.id)).toContain(
        'pending-sign-in'
      )
      return Promise.resolve()
    })
  }
)

// Une régression d'options runtime doit faire échouer le même garde, même si
// tous les vrais plugins et les autres réglages demeurent inchangés.
test('le garde refuse le hachage global des identifiants de vérification', async () => {
  configureEnvironment(false)
  const backend = createBackendTest()
  await backend.action((ctx) => {
    const options: BetterAuthOptions = createAuth(ctx).options
    expect(() =>
      assertAdvisoryConditions({
        ...options,
        verification: { ...options.verification, storeIdentifier: 'hashed' },
      })
    ).toThrow()
    return Promise.resolve()
  })
})

test('le fichier de configuration limite les exceptions aux trois avis approuvés', () => {
  const workspace = readFileSync(
    new URL('../../pnpm-workspace.yaml', import.meta.url),
    'utf-8'
  )
  expect(workspace.match(/^auditConfig:/gm)).toHaveLength(1)
  const auditConfig =
    /(?:^|\n)auditConfig:\r?\n {2}ignoreGhsas:\r?\n((?: {4}- GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}\r?\n)+)(?=\S|$)/.exec(
      workspace
    )
  expect(auditConfig).not.toBeNull()
  const ignoreGhsas = auditConfig?.[1]
    ?.trim()
    .split(/\r?\n/)
    .map((line) => line.trim().slice(2))
  // L'étape CI pnpm audit prouve que pnpm prend en compte cette clé.
  expect(ignoreGhsas).toEqual(advisories)
})

test('l’exception reste dans sa période de validité', () => {
  expect(
    new Date().toISOString().slice(0, 10) <= '2026-11-30',
    'Réexaminer l’exception Better Auth : échéance du 2026-11-30 dépassée. Voir docs/upgrades.md (T0).'
  ).toBe(true)
})
