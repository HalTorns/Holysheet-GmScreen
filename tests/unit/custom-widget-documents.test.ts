import { expect, test } from 'vitest'

import {
  sandboxDocument,
  sandboxPermissionsPolicy,
} from '../../src/lib/sandbox/documents'

test('sandbox documents hash the exact served bootstrap bytes and contain no app root or hydration', async () => {
  for (const kind of ['host', 'runner'] as const) {
    const response = await sandboxDocument(kind, 'https://app.example.com')
    const html = await response.text()
    const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1]
    if (!script) throw new Error('Missing bootstrap')
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(script)
    )
    const hash = btoa(String.fromCodePoint(...new Uint8Array(digest)))
    const csp = response.headers.get('Content-Security-Policy')
    expect(csp).toContain(
      `script-src 'sha256-${hash}'${kind === 'runner' ? " 'unsafe-eval'" : ''};`
    )
    expect(csp).not.toContain("script-src 'self'")
    expect(csp).toContain("frame-ancestors 'self'")
    expect(html).not.toMatch(/initialToken|__TSR|dehydrated|better-auth/)
    if (kind === 'host')
      expect(csp).toContain('frame-src https://app.example.com/sandbox/runner;')
    else expect(csp).toContain("webrtc 'block'")
  }
  expect(
    sandboxPermissionsPolicy.split(', ').every((entry) => entry.endsWith('=()'))
  ).toBe(true)
})
