import type { AuthSettings } from '../authOptions'

export function requiredEnvironment(name: string): string {
  const value = process.env[name]?.trim()
  if (!value)
    throw new Error(`Missing required backend environment variable: ${name}`)
  return value
}

export function getAuthSettings(): AuthSettings {
  const siteUrl = new URL(requiredEnvironment('SITE_URL'))
  const isLocal = ['localhost', '127.0.0.1'].includes(siteUrl.hostname)
  if (
    siteUrl.protocol !== 'https:' &&
    !(isLocal && siteUrl.protocol === 'http:')
  ) {
    throw new Error('SITE_URL must use HTTPS outside localhost.')
  }
  if (
    siteUrl.pathname !== '/' ||
    siteUrl.search ||
    siteUrl.hash ||
    siteUrl.username ||
    siteUrl.password
  ) {
    throw new Error(
      'SITE_URL must be an origin without path, credentials or query.',
    )
  }
  const secret = requiredEnvironment('BETTER_AUTH_SECRET')
  if (secret.length < 32)
    throw new Error('BETTER_AUTH_SECRET must contain at least 32 characters.')
  const passkeyRpId = requiredEnvironment('PASSKEY_RP_ID')
  if (passkeyRpId !== siteUrl.hostname) {
    throw new Error('PASSKEY_RP_ID must exactly match the SITE_URL hostname.')
  }
  return { siteUrl: siteUrl.origin, secret, passkeyRpId }
}
