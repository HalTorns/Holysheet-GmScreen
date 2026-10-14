import { appConfig } from '@shared/app-config'
import { serializeJsonLd } from '@shared/seo'

import { env } from '@/env'

export function pageMetadata({
  title,
  description = appConfig.description,
  path = '/',
  image,
  privatePage = false,
  jsonLd,
}: {
  title: string
  description?: string
  path?: string
  image?: string
  privatePage?: boolean
  jsonLd?: Record<string, unknown>
}) {
  const canonical = new URL(path, env.VITE_SITE_URL).href
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      {
        name: 'robots',
        content: privatePage ? 'noindex, nofollow' : 'index, follow',
      },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:type', content: 'website' },
      { property: 'og:url', content: canonical },
      { property: 'og:site_name', content: appConfig.name },
      {
        name: 'twitter:card',
        content: image ? 'summary_large_image' : 'summary',
      },
      ...(image
        ? [
            {
              property: 'og:image',
              content: new URL(image, env.VITE_SITE_URL).href,
            },
          ]
        : []),
    ],
    links: privatePage ? [] : [{ rel: 'canonical', href: canonical }],
    scripts:
      jsonLd && !privatePage
        ? [{ type: 'application/ld+json', children: serializeJsonLd(jsonLd) }]
        : [],
  }
}
