import { describe, expect, it } from 'vitest'

import css from '../../src/styles.css?raw'

// Les jetons de :root sont la source du thème « Console » (3b) : chaque texte
// doit rester lisible sur chaque surface où il apparaît.
function tokens() {
  const root = /:root\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
  const values = new Map<string, string>()
  for (const match of root.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})\s*;/gi))
    if (match[1] && match[2]) values.set(match[1], match[2])
  return values
}

const theme = tokens()
function token(name: string) {
  const value = theme.get(name)
  if (!value) throw new Error(`jeton --${name} absent de :root`)
  return value
}

const weights = [0.2126, 0.7152, 0.0722]
function luminance(hex: string) {
  let sum = 0
  for (const [index, weight] of weights.entries()) {
    const start = 1 + index * 2
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255
    sum +=
      weight *
      (channel <= 0.04045
        ? channel / 12.92
        : ((channel + 0.055) / 1.055) ** 2.4)
  }
  return sum
}

function contrast(a: string, b: string) {
  const [x, y] = [luminance(token(a)), luminance(token(b))]
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}

const surfaces = ['background', 'card', 'popover']

describe('thème Console', () => {
  it.each(
    [
      'foreground',
      'muted-foreground',
      'link',
      'destructive',
      'success',
      'warning',
    ].flatMap((text) => surfaces.map((surface) => [text, surface]))
  )('le texte %s est lisible sur %s', (text, surface) => {
    expect(contrast(text, surface)).toBeGreaterThanOrEqual(4.5)
  })

  it.each(['primary', 'primary-hover', 'primary-active', 'destructive'])(
    'le texte des boutons pleins est lisible sur %s',
    (fill) => {
      expect(contrast('primary-foreground', fill)).toBeGreaterThanOrEqual(4.5)
    }
  )

  it('la mise en garde est lisible sur sa surface', () => {
    expect(contrast('warning', 'warning-surface')).toBeGreaterThanOrEqual(4.5)
  })

  it.each(
    ['ring', 'selection'].flatMap((mark) =>
      ['background', 'card'].map((surface) => [mark, surface])
    )
  )('le repère %s se distingue de %s', (mark, surface) => {
    expect(contrast(mark, surface)).toBeGreaterThanOrEqual(3)
  })
})
