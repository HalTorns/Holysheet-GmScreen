import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import {
  escapeNoteText,
  safeNoteUrl,
} from '../../src/features/gm/rich-text/policy'
import { NoteRender } from '../../src/features/gm/rich-text/render'

const render = (
  body: string,
  staticOutput = false,
  bodyFormat: 'plain' | 'markdown-v1' = 'markdown-v1'
) =>
  renderToStaticMarkup(
    createElement(NoteRender, { body, bodyFormat, staticOutput })
  )

describe('note rendering through the sanitized React pipeline', () => {
  it('renders the supported subset with visible newlines and adapted headings', () => {
    const html = render(
      '# Titre\n\n**gras** *italique*\nligne\n\n- un\n- deux\n\n1. premier\n\n`code`\n\n```js\n<literal>\n```'
    )
    for (const tag of ['h3', 'strong', 'em', 'br', 'ul', 'ol', 'code', 'pre'])
      expect(html).toContain(`<${tag}`)
    expect(html).toContain('&lt;literal&gt;')
    expect(html).not.toContain('class="language')
  })
  it('never interprets plain notes, including syntax and HTML', () => {
    const body = '# titre\n**gras** <script>x</script>'
    const html = render(body, false, 'plain')
    expect(html).toContain('# titre\n**gras** &lt;script&gt;x&lt;/script&gt;')
    const activated = render(escapeNoteText(body).replaceAll('\n', '&#10;'))
    expect(activated).toContain('**gras** &lt;script&gt;x&lt;/script&gt;')
    expect(activated).not.toContain('<strong>')
  })
  it('renders native details and expands every body in static output', () => {
    const source = ':::details[Résumé]\n**secret**\n:::'
    expect(render(source)).toContain('<details><summary>Résumé</summary>')
    const html = render(source, true)
    expect(html).toContain('Résumé')
    expect(html).toContain('<strong>secret</strong>')
    expect(html).not.toMatch(/<details|<summary|<button|hidden|open=/u)
  })
  it.each([
    ':::unknown[Titre]\ntexte\n:::',
    ':::details\ntexte\n:::',
    ':::details[]\ntexte\n:::',
    ':::details[Titre]{open onclick="evil()"}\ntexte\n:::',
    ':::details[Titre]\nnon fermé',
    ':::details[Titre]\n:::details[Interne]\ntexte\n:::\n:::',
    `:::details[${'x'.repeat(121)}]\ntexte\n:::`,
    ':details[bad]{onclick="evil()"}',
  ])('keeps invalid directives literal: %s', (source) => {
    const html = render(source)
    expect(html).not.toContain('<details')
    expect(html).toContain(
      source.startsWith(':::unknown') ? 'unknown' : 'details'
    )
    expect(html).not.toContain('<script')
  })
  it.each([
    '<script>alert(1)</script>',
    '<img src="https://evil.test/x" onerror="evil()">',
    '<svg onload="evil()"><script>evil()</script></svg>',
    '<math href="javascript:evil()">x</math>',
    '<iframe src="https://evil.test"></iframe>',
    '<style>body{display:none}</style>',
    '![image](https://evil.test/image)',
    '[x](javascript:evil)',
    '[x](data:text/html,evil)',
    '[x](vbscript:evil)',
    '[x](jav&#x61;script:evil)',
    '[x](java&#10;script:evil)',
    '[x](//evil.test)',
    '[x](/relative)',
    '[x](javascript\\:evil)',
    ':::details[x]{style="color:red"}\n<script>evil()</script>\n:::',
  ])('blocks active HTML and unsafe links: %s', (source) => {
    const html = render(source)
    expect(html).not.toMatch(
      /<(?:script|img|svg|math|iframe|style)\b|\s(?:style|onclick|onerror|onload|id|data-x)=|href=|src=/u
    )
  })
  it('allows only absolute HTTP(S) and mailto with the required link attributes', () => {
    expect(
      render(
        '[a](https://example.test) [b](http://example.test) [c](mailto:a@example.test)'
      )
    ).toContain('target="_blank" rel="noopener noreferrer"')
    expect(render('[c](mailto:a@example.test)')).toContain(
      '<a href="mailto:a@example.test" class="underline">'
    )
    for (const url of [
      'https://example.test',
      'http://example.test',
      'mailto:a@example.test',
    ])
      expect(safeNoteUrl(url)).toBe(url)
    for (const url of [
      '//a',
      '/a',
      'https:a',
      ' https://a',
      'java\tscript:a',
      'data:a',
      'vbscript:a',
      'https://a\u007F',
      'https://a\u0085',
    ])
      expect(safeNoteUrl(url)).toBeNull()
  })
  it('falls back to the entire literal source beyond AST depth or node limits', () => {
    const source = `${'> '.repeat(40)}**deep**`
    const html = render(source)
    expect(html).toContain('limite de rendu dépassée')
    expect(html).toContain('**deep**')
    const many = '- item\n'.repeat(1800)
    expect(render(many)).toContain('limite de rendu dépassée')
  })
})
