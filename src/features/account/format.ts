import { appConfig } from '@shared/app-config'

export function formatAccountDate(
  value: string | number | Date | null | undefined,
): string {
  if (!value) return 'Date indisponible'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'Date indisponible'
  return date.toLocaleDateString(appConfig.locale, {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: appConfig.timeZone,
  })
}

export function sessionDeviceLabel(
  userAgent: string | null | undefined,
): string {
  if (!userAgent) return 'Appareil non identifié'
  let browser = 'Navigateur'
  if (userAgent.includes('Edg/')) browser = 'Edge'
  else if (userAgent.includes('Firefox/')) browser = 'Firefox'
  else if (userAgent.includes('Chrome/')) browser = 'Chrome'
  else if (userAgent.includes('Safari/')) browser = 'Safari'
  let device = 'ordinateur'
  if (userAgent.includes('iPhone')) device = 'iPhone'
  else if (userAgent.includes('iPad')) device = 'iPad'
  else if (userAgent.includes('Android')) device = 'Android'
  else if (userAgent.includes('Macintosh')) device = 'Mac'
  else if (userAgent.includes('Windows')) device = 'Windows'
  else if (userAgent.includes('Linux')) device = 'Linux'
  return `${browser} sur ${device}`
}
