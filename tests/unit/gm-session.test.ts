import { describe, expect, it } from 'vitest'

import {
  advanceInitiative,
  clockElapsed,
  formatClock,
  initiativeOrder,
  removeInitiative,
} from '../../shared/gm-session'
import {
  parseTablePaste,
  tableFromPaste,
} from '../../src/features/gm/table-paste'

// Derived behavior is not persisted: these cases protect stable tie order,
// wraparound, removal of the active entry and display boundary calculations.
describe('session widget derivations', () => {
  const entries = [
    { id: 'a', name: 'A', score: 5, note: '' },
    { id: 'b', name: 'B', score: 10, note: '' },
    { id: 'c', name: 'C', score: 10, note: '' },
  ]
  it('sorts stably without changing insertion order, advances and wraps rounds', () => {
    expect(initiativeOrder(entries).map((entry) => entry.id)).toEqual([
      'b',
      'c',
      'a',
    ])
    expect(entries.map((entry) => entry.id)).toEqual(['a', 'b', 'c'])
    const first = advanceInitiative({ entries, round: 1 })
    expect(first).toMatchObject({ currentId: 'b', round: 1 })
    const second = advanceInitiative(first)
    expect(second).toMatchObject({ currentId: 'c', round: 1 })
    expect(advanceInitiative(advanceInitiative(second))).toMatchObject({
      currentId: 'b',
      round: 2,
    })
    expect(advanceInitiative({ entries: [], round: 1 })).toEqual({
      entries: [],
      round: 1,
    })
  })
  it('removes the current entry and chooses its successor, including the last and only entry', () => {
    expect(
      removeInitiative({ entries, currentId: 'b', round: 2 }, 'b')
    ).toMatchObject({ currentId: 'c', round: 2 })
    expect(
      removeInitiative({ entries, currentId: 'a', round: 2 }, 'a')
    ).toMatchObject({ currentId: 'b', round: 2 })
    expect(
      removeInitiative(
        { entries: entries.slice(0, 1), currentId: 'a', round: 1 },
        'a'
      )
    ).toEqual({ entries: [], round: 1 })
    expect(
      removeInitiative({ entries, currentId: 'b', round: 1 }, 'a').currentId
    ).toBe('b')
  })
  it('formats zero, seconds, minutes, hours and frozen or running elapsed time', () => {
    for (const [value, text] of [
      [-1, '00:00'],
      [0, '00:00'],
      [999, '00:00'],
      [61_000, '01:01'],
      [3_661_000, '1:01:01'],
    ] as const)
      expect(formatClock(value)).toBe(text)
    expect(
      clockElapsed({ running: true, elapsedMs: 1000, startedAt: 2000 }, 4500)
    ).toBe(3500)
    expect(clockElapsed({ running: false, elapsedMs: 1000 }, 4500)).toBe(1000)
    expect(
      clockElapsed({ running: true, elapsedMs: 1000, startedAt: 5000 }, 4500)
    ).toBe(1000)
  })
})
describe('TSV table paste', () => {
  it('preserves empty cells, CRLF and deterministic rows; optionally consumes headers', () => {
    const parsed = parseTablePaste('', 'A\tB\tC\r\n1\t\t3\r\n')
    expect(parsed).toEqual({
      cells: [
        ['A', 'B', 'C'],
        ['1', '', '3'],
      ],
      headers: false,
    })
    expect(tableFromPaste(parsed, true)).toEqual({
      columns: [
        { id: 'column-1', label: 'A' },
        { id: 'column-2', label: 'B' },
        { id: 'column-3', label: 'C' },
      ],
      rows: [{ id: 'row-1', cells: ['1', '', '3'] }],
    })
    expect(tableFromPaste(parsed, false).rows).toHaveLength(2)
  })
  it('rejects dimensions, ragged rows, oversized cells and headers without truncation', () => {
    for (const text of [
      Array.from({ length: 13 }, () => 'a').join('\t'),
      Array.from({ length: 101 }, () => 'a').join('\n'),
    ])
      expect(() => parseTablePaste('', text)).toThrow(
        '12 colonnes / 100 lignes maximum'
      )
    expect(() => parseTablePaste('', 'a\tb\nc')).toThrow('largeurs différentes')
    expect(() => parseTablePaste('', 'x'.repeat(501))).toThrow('500 caractères')
    expect(() =>
      tableFromPaste(parseTablePaste('', 'x'.repeat(61)), true)
    ).toThrow('60 caractères')
    expect(() => parseTablePaste('', 'x'.repeat(200_001))).toThrow('volumineux')
  })
})
