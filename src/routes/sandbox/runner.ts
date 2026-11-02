import { createFileRoute } from '@tanstack/react-router'

import { env } from '@/env'
import { sandboxDocument } from '@/lib/sandbox/documents'

export const Route = createFileRoute('/sandbox/runner')({
  server: {
    handlers: {
      GET: () => sandboxDocument('runner', new URL(env.VITE_SITE_URL).origin),
    },
  },
})
