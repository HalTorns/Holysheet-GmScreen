import { createFileRoute } from '@tanstack/react-router'

import { publicPages } from '@/config/seo'
import { env } from '@/env'

export const Route = createFileRoute('/sitemap.xml')({
  server: {
    handlers: {
      GET: () => {
        const entries = publicPages
          .map(
            (page) =>
              `<url><loc>${new URL(page.path, env.VITE_SITE_URL).href.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')}</loc></url>`
          )
          .join('')
        return new Response(
          `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries}</urlset>`,
          { headers: { 'Content-Type': 'application/xml; charset=utf-8' } }
        )
      },
    },
  },
})
