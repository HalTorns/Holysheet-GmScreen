// Always inspect WHATWG-parsed fields: unusual IPv4 spellings and encoded
// hostnames must have the same policy as their canonical representation.
function forbiddenIpv4(host: string) {
  const parts = host.split('.').map(Number)
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part)))
    return false
  const [a = 0, b = 0] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  )
}
function forbiddenHost(host: string) {
  if (
    host === 'localhost' ||
    ['local', 'internal', 'localhost', 'test'].some((suffix) =>
      host.endsWith(`.${suffix}`)
    )
  )
    return true
  if (!host.startsWith('[')) return forbiddenIpv4(host)
  // The URL parser serializes IPv6 as compressed hexadecimal, including IPv4
  // mapped addresses. Expand it before inspecting prefixes and embedded IPv4.
  const halves = host.slice(1, -1).split('::')
  const left = halves[0]?.split(':').filter(Boolean) ?? []
  const right = halves[1]?.split(':').filter(Boolean) ?? []
  const words = [
    ...left,
    ...Array.from({ length: 8 - left.length - right.length }, () => '0'),
    ...right,
  ].map((word) => Number.parseInt(word, 16))
  const first = words[0] ?? 0
  if (
    words.every((word) => word === 0) ||
    (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) ||
    (first & 0xfe_00) === 0xfc_00 ||
    (first & 0xff_c0) === 0xfe_80
  )
    return true
  if (words.slice(0, 5).every((word) => word === 0) && words[5] === 0xff_ff) {
    const high = words[6] ?? 0
    const low = words[7] ?? 0
    return forbiddenIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`)
  }
  return false
}
function canonicalUrl(value: string) {
  const url = new URL(value)
  if (!url.hostname.startsWith('['))
    url.hostname = url.hostname.replace(/\.+$/, '')
  return url
}
export function parseEmbedUrl(value: string, appOrigins: readonly string[]) {
  try {
    const url = canonicalUrl(value)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !url.hostname ||
      url.href.length > 2048 ||
      forbiddenHost(url.hostname)
    )
      return null
    if (appOrigins.some((origin) => canonicalUrl(origin).origin === url.origin))
      return null
    return { url: url.href, hostname: url.hostname }
  } catch {
    return null
  }
}
