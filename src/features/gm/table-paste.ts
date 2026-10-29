import { stripEventHandlers } from './rich-text/paste'

type TablePaste = { cells: string[][]; headers: boolean }
export function parseTablePaste(html: string, plain: string): TablePaste {
  if (html.length > 200_000 || plain.length > 200_000)
    throw new Error('Collage trop volumineux.')
  let cells: string[][] = []
  let headers = false
  if (html) {
    const document_ = document.implementation.createHTMLDocument('')
    const template = document_.createElement('template')
    template.innerHTML = stripEventHandlers(html)
    for (const element of template.content.querySelectorAll(
      'script,style,iframe,object,embed,svg,math,template'
    ))
      element.remove()
    const table = template.content.querySelector('table')
    if (table) {
      headers = Boolean(table.querySelector('th'))
      cells = [...table.querySelectorAll('tr')]
        .filter((row) => row.closest('table') === table)
        .map((row) =>
          [...row.children]
            .filter((cell) => cell.tagName === 'TD' || cell.tagName === 'TH')
            .map((cell) => cell.textContent ?? '')
        )
    }
  }
  if (!cells.length)
    cells = plain
      .replaceAll('\r\n', '\n')
      .replaceAll('\r', '\n')
      .replace(/\n$/u, '')
      .split('\n')
      .map((row) => row.split('\t'))
  validatePaste(cells, headers)
  return { cells, headers }
}
function validatePaste(cells: string[][], headers: boolean) {
  const width = cells[0]?.length ?? 0
  if (!width || width > 12 || cells.length - (headers ? 1 : 0) > 100)
    throw new Error('12 colonnes / 100 lignes maximum.')
  if (cells.some((row) => row.length !== width))
    throw new Error('Lignes de largeurs différentes.')
  if (cells.some((row) => row.some((cell) => cell.length > 500)))
    throw new Error('500 caractères maximum par cellule.')
  if (headers && cells[0]?.some((cell) => cell.length > 60))
    throw new Error('60 caractères maximum par en-tête.')
}
export function tableFromPaste(paste: TablePaste, headers: boolean) {
  validatePaste(paste.cells, headers)
  return {
    columns: (paste.cells[0] ?? []).map((label, index) => ({
      id: `column-${index + 1}`,
      label: headers ? label : `Colonne ${index + 1}`,
    })),
    rows: paste.cells
      .slice(headers ? 1 : 0)
      .map((cells, index) => ({ id: `row-${index + 1}`, cells })),
  }
}
