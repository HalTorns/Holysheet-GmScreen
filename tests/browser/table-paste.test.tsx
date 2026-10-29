import { expect, test } from 'vitest'

import {
  parseTablePaste,
  tableFromPaste,
} from '../../src/features/gm/table-paste'

// HTML needs the browser's real inert DOM parser; backend/unit tests have no DOM.
// Active content and on* attributes must never execute or enter the cell text.
test('extracts inert HTML table text, empty cells and header defaults without executing content', () => {
  const html =
    '<table onclick="throw new Error(1)"><tr><th>A</th><th>B</th></tr><tr><td onmouseover="throw new Error(2)">texte<script>throw new Error(3)</script><img src="/must-not-fetch" onerror="throw new Error(4)"></td><td></td></tr></table>'
  const parsed = parseTablePaste(html, 'fallback')
  expect(parsed).toEqual({
    headers: true,
    cells: [
      ['A', 'B'],
      ['texte', ''],
    ],
  })
  expect(tableFromPaste(parsed, true).rows).toEqual([
    { id: 'row-1', cells: ['texte', ''] },
  ])
  expect(document.querySelector('table')).toBeNull()
  expect(() =>
    parseTablePaste(`<table><tr>${'<td>x</td>'.repeat(13)}</tr></table>`, '')
  ).toThrow('12 colonnes / 100 lignes maximum')
  expect(() =>
    parseTablePaste(`<table>${'<tr><td>x</td></tr>'.repeat(101)}</table>`, '')
  ).toThrow('12 colonnes / 100 lignes maximum')
})
