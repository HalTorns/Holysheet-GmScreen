import { z } from './zod'

export const featureFlag = z
  .enum(['true', 'false'])
  .default('false')
  .transform((value) => value === 'true')
export const optionalSecret = z.string().trim().min(1).optional()
export const publicOrigin = z.url().refine((value) => {
  const url = new URL(value)
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  return (
    (url.protocol === 'https:' || (url.protocol === 'http:' && local)) &&
    !url.username &&
    !url.password &&
    !url.search &&
    !url.hash &&
    url.pathname === '/'
  )
}, 'Une origine HTTPS est requise, ou HTTP sur localhost uniquement.')

export function invalidEnvironment(): never {
  // Validation errors can contain rejected inputs. Keep values out of logs.
  throw new Error(
    'Configuration d’environnement invalide. Vérifier les variables documentées sans afficher leurs valeurs.'
  )
}

export const telemetryDsn = z.url().refine((value) => {
  const url = new URL(value)
  return (
    (url.protocol === 'https:' ||
      (url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) &&
    Boolean(url.username) &&
    !url.password &&
    !url.search &&
    !url.hash &&
    /\/\d+\/?$/.test(url.pathname)
  )
}, 'Un DSN public Sentry valide est requis, sans secret ni query.')
