export function safeNoteUrl(value: string): string | null {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code <= 32 || (code >= 127 && code <= 159)) return null
  }
  if (!/^(?:https?:\/\/|mailto:)/iu.test(value)) return null
  try {
    const url = new URL(value)
    if (['http:', 'https:', 'mailto:'].includes(url.protocol)) return value
  } catch {
    return null
  }
  return null
}

// Escape punctuation recognized by CommonMark and directives. Preserve line breaks.
export function escapeNoteText(value: string): string {
  return value.replaceAll(/([\\`*&<_{}[\]()#+.!|>~:-])/gu, '\\$1')
}
