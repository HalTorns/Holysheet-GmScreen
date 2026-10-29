import { escapeNoteText, safeNoteUrl } from './policy'

export type PasteResult = {
  body: string
  message: string
  fallback: boolean
  requiresPlainPaste?: boolean
}
const eventHandler =
  /(<[a-z][^>]*?)\s+on[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'>]+)/giu

export function stripEventHandlers(html: string) {
  let previous = ''
  let current = html
  // Une passe peut révéler un attribut suivant dans la même balise.
  for (let pass = 0; pass < 64 && current !== previous; pass++) {
    previous = current
    current = current.replaceAll(eventHandler, '$1')
  }
  return current
}

// The template lives in a separate inert document, never in the host document.
// Template parsing has no browsing context and does not fetch subresources.
export function convertNotePaste(html: string, plain: string): PasteResult {
  const fallback = (
    message: string,
    requiresPlainPaste = false
  ): PasteResult => ({
    body: escapeNoteText(plain),
    message,
    fallback: true,
    requiresPlainPaste,
  })
  if (!html) return fallback('Collage en texte brut.')
  if (html.length > 200_000)
    return fallback(
      'HTML trop volumineux ; utilisez Coller en texte brut puis collez à nouveau.',
      true
    )
  const document_ = document.implementation.createHTMLDocument('')
  const template = document_.createElement('template')
  // Chromium évalue la CSP des attributs on* dès l'analyse, même dans un
  // document inerte : ils sont retirés des balises avant l'analyse (défense
  // en profondeur ; le convertisseur ne lit de toute façon aucun attribut on*).
  template.innerHTML = stripEventHandlers(html)
  let count = 0
  let exceeded = false
  let simplified = false
  function inspect(node: Node, depth: number) {
    count += 1
    if (count > 5000 || depth > 32) {
      exceeded = true
      return
    }
    for (const child of node.childNodes) {
      if (exceeded) break
      inspect(child, depth + 1)
    }
  }
  inspect(template.content, 0)
  if (exceeded)
    return fallback(
      'HTML trop complexe ; utilisez Coller en texte brut puis collez à nouveau.',
      true
    )
  function convert(node: Node): string {
    if (node.nodeType === Node.TEXT_NODE)
      return escapeNoteText(node.textContent ?? '')
    if (!(node instanceof Element))
      return [...node.childNodes].map(convert).join('')
    const tag = node.tagName.toLowerCase()
    if (
      [
        'script',
        'style',
        'iframe',
        'object',
        'embed',
        'svg',
        'math',
        'link',
        'meta',
        'base',
        'input',
        'video',
        'audio',
      ].includes(tag)
    ) {
      simplified = true
      return ''
    }
    if (tag === 'img') {
      simplified = true
      return escapeNoteText(node.getAttribute('alt') ?? '')
    }
    const text = [...node.childNodes].map(convert).join('')
    if (tag === 'strong' || tag === 'b') return `**${text}**`
    if (tag === 'em' || tag === 'i') return `*${text}*`
    if (tag === 'br') return '\n'
    if (/^h[1-3]$/u.test(tag))
      return `\n\n${'#'.repeat(Number(tag[1]))} ${text}\n\n`
    if (tag === 'a') {
      const url = safeNoteUrl(node.getAttribute('href') ?? '')
      if (!url) {
        simplified = true
        return text
      }
      return `[${text}](${url.replaceAll('(', '%28').replaceAll(')', '%29').replaceAll('\\', '%5C')})`
    }
    if (tag === 'li')
      return `${node.parentElement?.tagName === 'OL' ? '1.' : '-'} ${text.trim().replaceAll('\n', '\n  ')}\n`
    if (tag === 'ul' || tag === 'ol') return `\n\n${text}\n`
    if (tag === 'td' || tag === 'th') {
      simplified = true
      return `${text}\t`
    }
    if (tag === 'tr') return `${text.trimEnd()}\n`
    if (['p', 'div', 'table'].includes(tag)) return `\n\n${text}\n\n`
    if (!['span', 'tbody', 'thead'].includes(tag)) simplified = true
    return text
  }
  const body = convert(template.content).trim()
  if (!body && plain)
    return fallback('HTML non convertible ; texte brut proposé.')
  return {
    body,
    message: simplified
      ? 'Collage simplifié : contenu actif, styles, tableaux et images retirés ou convertis en texte.'
      : 'Collage converti ; styles ignorés.',
    fallback: false,
  }
}
