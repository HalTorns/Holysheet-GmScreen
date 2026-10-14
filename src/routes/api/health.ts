import { createFileRoute } from '@tanstack/react-router'

import { env } from '@/env'

export const Route = createFileRoute('/api/health')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await fetch(`${env.VITE_CONVEX_URL}/version`, {
            signal: AbortSignal.timeout(2000),
          })
          return Response.json(
            { status: result.ok ? 'ok' : 'unavailable' },
            { status: result.ok ? 200 : 503 }
          )
        } catch {
          return Response.json({ status: 'unavailable' }, { status: 503 })
        }
      },
    },
  },
})
