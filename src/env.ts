import { z } from '@shared/zod'

const publicOrigin = z.url().refine((value) => {
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

const publicEnvironmentSchema = z.object({
  VITE_SITE_URL: publicOrigin,
  VITE_CONVEX_URL: publicOrigin,
  VITE_CONVEX_SITE_URL: publicOrigin,
})

export const env = publicEnvironmentSchema.parse({
  VITE_SITE_URL: import.meta.env.VITE_SITE_URL,
  VITE_CONVEX_URL: import.meta.env.VITE_CONVEX_URL,
  VITE_CONVEX_SITE_URL: import.meta.env.VITE_CONVEX_SITE_URL,
})
