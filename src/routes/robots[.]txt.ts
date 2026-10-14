import { createFileRoute } from '@tanstack/react-router'

import { env } from '@/env'

export const Route = createFileRoute('/robots.txt')({
  server: {
    handlers: {
      GET: () => {
        const local = ['localhost', '127.0.0.1', '[::1]'].includes(
          new URL(env.VITE_SITE_URL).hostname
        )
        const text = local
          ? 'User-agent: *\nDisallow: /\n'
          : `User-agent: *\nAllow: /\nDisallow: /app\nDisallow: /api/\nDisallow: /sign-in\nDisallow: /verify-mfa\nSitemap: ${env.VITE_SITE_URL}/sitemap.xml\n`
        return new Response(text, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        })
      },
    },
  },
})
