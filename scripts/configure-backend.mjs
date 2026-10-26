import { existsSync } from 'node:fs'
import { join } from 'node:path'

const projectRoot = join(import.meta.dirname, '..')

try {
  if (process.argv.length > 2)
    throw new Error(
      'Usage: pnpm backend:configure. Extra arguments are not allowed.'
    )
  if (
    ['.env', '.env.local'].some((name) => existsSync(join(projectRoot, name)))
  )
    throw new Error(
      'Use the operations container, not the development checkout.'
    )
  if (
    ['CONVEX_DEPLOY_KEY', 'CONVEX_DEPLOYMENT', 'CONVEX_DEPLOYMENT_TOKEN'].some(
      (name) => process.env[name]
    )
  )
    throw new Error(
      'Cloud selectors are not allowed in production configuration.'
    )
  const target = new URL(process.env.CONVEX_SELF_HOSTED_URL ?? '')
  if (
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== '/' ||
    !(
      target.protocol === 'https:' ||
      (target.protocol === 'http:' &&
        target.hostname === 'backend' &&
        target.port === '3210')
    )
  )
    throw new Error(
      'Use the explicit HTTPS production API or http://backend:3210 inside operations.'
    )
  const site = new URL(process.env.VITE_SITE_URL ?? '')
  if (
    site.protocol !== 'https:' ||
    site.username ||
    site.password ||
    site.pathname !== '/' ||
    site.search ||
    site.hash
  )
    throw new Error('VITE_SITE_URL must be an exact HTTPS origin.')
  const required = [
    'CONVEX_SELF_HOSTED_ADMIN_KEY',
    'BETTER_AUTH_SECRET',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_SECURITY',
    'SMTP_USER',
    'SMTP_PASSWORD',
  ]
  if (required.some((name) => !process.env[name]))
    throw new Error(
      'Set the required private authentication and SMTP variables in the operations runtime.'
    )
  if (process.env.BETTER_AUTH_SECRET.length < 32)
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.')
  if (
    !['tls', 'starttls'].includes(process.env.SMTP_SECURITY) ||
    !/^[1-9][0-9]{0,4}$/.test(process.env.SMTP_PORT) ||
    Number(process.env.SMTP_PORT) > 65_535
  )
    throw new Error(
      'Set a valid SMTP_PORT and SMTP_SECURITY (tls or starttls).'
    )
  if (!/^[a-zA-Z0-9.-]{1,253}$/.test(process.env.SMTP_HOST))
    throw new Error('SMTP_HOST must be a hostname.')
  const values = {
    SITE_URL: site.origin,
    PASSKEY_RP_ID: site.hostname,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    AUTH_PASSWORD_ONLY: 'true',
    AUTH_CREDENTIALS_ENABLED: 'true',
    ORGANIZATIONS_ENABLED: 'false',
    AUTH_EMAIL_PROVIDER: 'smtp',
    AUTH_EMAIL_FROM: 'admin@holysheet.fr',
    SMTP_HOST: process.env.SMTP_HOST,
    SMTP_PORT: process.env.SMTP_PORT,
    SMTP_SECURITY: process.env.SMTP_SECURITY,
    SMTP_USER: process.env.SMTP_USER,
    SMTP_PASSWORD: process.env.SMTP_PASSWORD,
    SMTP_EHLO_NAME: process.env.SMTP_EHLO_NAME || site.hostname,
  }
  const response = await fetch(
    new URL('/api/update_environment_variables', target),
    {
      method: 'POST',
      headers: {
        Authorization: `Convex ${process.env.CONVEX_SELF_HOSTED_ADMIN_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        changes: Object.entries(values).map(([name, value]) => ({
          name,
          value,
        })),
      }),
      signal: AbortSignal.timeout(15_000),
    }
  )
  if (!response.ok)
    throw new Error(
      `Production configuration refused (HTTP ${response.status}).`
    )
  console.info(
    'Backend authentication and SMTP configuration saved. No secrets displayed. Run pnpm backend:deploy next.'
  )
} catch {
  // Do not print raw exceptions: fetch/SMTP errors can contain sensitive data.
  console.error(
    'Production configuration failed. Check the explicit target, private runtime variables and backend connectivity; no secret values were printed.'
  )
  process.exitCode = 1
}
