import { ConvexError } from 'convex/values'

import { parseEmbedUrl } from '../../shared/embed-url'
import type { Widget } from './gmFormats'

export function validatedEmbedConfig(
  config: Extract<Widget, { kind: 'embed' }>['config']
) {
  if (config.url === '') return config
  const parsed = parseEmbedUrl(
    config.url,
    [
      process.env.SITE_URL,
      process.env.CONVEX_CLOUD_URL,
      process.env.CONVEX_SITE_URL,
    ].filter((value): value is string => Boolean(value))
  )
  if (!parsed) throw new ConvexError({ code: 'INVALID_URL' })
  return { ...config, url: parsed.url }
}
