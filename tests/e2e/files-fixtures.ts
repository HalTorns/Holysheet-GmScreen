import { readFile } from 'node:fs/promises'

import type { BrowserContext } from '@playwright/test'
import { z } from 'zod'

import type { Id } from '../../convex/_generated/dataModel'
import { backendSiteUrl } from '../../scripts/local-config.mjs'
import { SITE_URL } from './helpers'

const uploadResult = z.object({
  id: z.custom<Id<'gmFiles'>>(
    (value) => typeof value === 'string' && value.length > 0
  ),
  mimeType: z.string(),
})
export async function uploadFixture(
  context: BrowserContext,
  projectId: Id<'gmProjects'>,
  name: 'pixel.png' | 'two-pages.pdf' | 'polyglot.gif'
) {
  const tokenResponse = await context.request.get(
    `${SITE_URL}/api/auth/convex/token`
  )
  if (!tokenResponse.ok())
    throw new Error('File fixture authentication unavailable')
  const { token } = z
    .object({ token: z.string() })
    .parse(await tokenResponse.json())
  const site = backendSiteUrl
  const data =
    name === 'polyglot.gif'
      ? Buffer.concat([
          Buffer.from(
            'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7',
            'base64'
          ),
          Buffer.from(
            '<html><script>window.polyglotExecuted=true</script></html>'
          ),
        ])
      : await readFile(new URL(`../fixtures/files/${name}`, import.meta.url))
  const response = await context.request.post(
    `${site}/files/upload?projectId=${projectId}&name=${name}`,
    {
      headers: {
        Origin: SITE_URL,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'text/html',
      },
      data,
    }
  )
  if (!response.ok())
    throw new Error(`File fixture upload failed (${response.status()})`)
  return uploadResult.parse(await response.json())
}
