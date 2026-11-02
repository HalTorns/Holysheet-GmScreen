import { expect, test } from 'vitest'

import { parseEmbedUrl } from '../../shared/embed-url'

const origins = [
  'https://app.example.com',
  'https://cloud.example.com',
  'https://site.example.com',
]
// These adversarial spellings bypass raw-text checks; assert the canonical
// browser destination, including origin comparisons, before rendering anything.
test.each([
  'http://example.com',
  // oxlint-disable-next-line eslint/no-script-url -- Adversarial URL must be rejected by the real parser.
  'javascript:alert(1)',
  'data:text/html,hello',
  'https://user:pass@example.com',
  'https://user@example.com',
  'https://localhost.',
  'https://a.localhost',
  'https://x.local.',
  'https://x.internal',
  'https://x.test',
  'https://127.1',
  'https://2130706433',
  'https://0177.0.0.1',
  'https://0x7f000001',
  'https://%31%32%37.0.0.1',
  'https://%6cocalhost',
  'https://10.2.3.4',
  'https://172.16.0.1',
  'https://172.31.255.255',
  'https://192.168.1.1',
  'https://169.254.1.1',
  'https://0.1.2.3',
  'https://100.64.0.1',
  'https://100.127.255.255',
  'https://[::]',
  'https://[::1]',
  'https://[fc00::1]',
  'https://[fdff::1]',
  'https://[fe80::1]',
  'https://[febf::1]',
  'https://[::ffff:127.0.0.1]',
  'https://[::ffff:7f00:1]',
  'https://[::ffff:192.168.1.1]',
  'https://APP.example.com.:443/path',
  'https://cloud.example.com',
  'https://site.example.com',
  `https://example.com/${'a'.repeat(2048)}`,
  '',
])('rejects %s', (url) => {
  expect(parseEmbedUrl(url, origins)).toBeNull()
})
test.each([
  ['https://EXAMPLE.com.:443/a b', 'https://example.com/a%20b', 'example.com'],
  ['https://école.fr', 'https://xn--cole-9oa.fr/', 'xn--cole-9oa.fr'],
  ['https://8.8.8.8', 'https://8.8.8.8/', '8.8.8.8'],
  [
    'https://[2606:4700::1111]',
    'https://[2606:4700::1111]/',
    '[2606:4700::1111]',
  ],
  ['https://[::ffff:808:808]', 'https://[::ffff:808:808]/', '[::ffff:808:808]'],
  ['https://100.128.0.1', 'https://100.128.0.1/', '100.128.0.1'],
])('canonicalizes %s', (url, expected, hostname) => {
  expect(parseEmbedUrl(url, origins)).toEqual({ url: expected, hostname })
})
test('length is measured after serialization, including encoded Unicode', () => {
  const prefix = 'https://example.com/'
  expect(
    parseEmbedUrl(prefix + 'a'.repeat(2048 - prefix.length), origins)
  ).not.toBeNull()
  expect(parseEmbedUrl(prefix + 'é'.repeat(400), origins)).toBeNull()
  expect(
    parseEmbedUrl('https://example.com', ['https://EXAMPLE.com.:443/'])
  ).toBeNull()
})
