import { api } from '@convex/_generated/api'
import { createServerFn } from '@tanstack/react-start'
import { ConvexHttpClient } from 'convex/browser'

import { env } from '@/env'

// The authenticated realtime client intentionally waits for auth. Public login
// configuration is loaded separately; no bearer or private configuration.
export const getPublicCapabilities = createServerFn({ method: 'GET' }).handler(
  () =>
    new ConvexHttpClient(env.VITE_CONVEX_URL).query(api.capabilities.get, {})
)
