import { describe, expect, it } from 'vitest'

import { parseDice, rollDice } from '../../shared/dice'

describe('Dice expressions and bounded unbiased rolls', () => {
  it('accepts the grammar and inclusive limits', () => {
    expect(parseDice(' 2 d 6 + 1 ')).toEqual({
      count: 2,
      sides: 6,
      modifier: 1,
    })
    expect(parseDice('100D1000-10000')).toEqual({
      count: 100,
      sides: 1000,
      modifier: -10_000,
    })
    expect(parseDice('1d2+10000')?.modifier).toBe(10_000)
  })
  it('rejects references, functions, fractions, incomplete input and limits', () => {
    for (const expression of [
      'd20',
      '0d6',
      '101d6',
      '1d1',
      '1d1001',
      '1d6+10001',
      '1d6-10001',
      '1d6!',
      '2.5d6',
      '1d6+1.5',
      '1d6+foo',
      'abs(1d6)',
      '1d6+1-1',
      '1d6 trailing',
      ' '.repeat(41),
    ])
      expect(parseDice(expression)).toBeNull()
    expect(() => rollDice('bad', () => 0)).toThrow('invalide')
  })
  it('rejects out-of-multiple words before modulo and includes the modifier in the total', () => {
    const words = [4_294_967_295, 0, 5]
    expect(rollDice('2d6-1', () => words.shift() ?? 0)).toEqual({
      rolls: [1, 6],
      total: 6,
    })
    expect(words).toHaveLength(0)
  })
  it('bounds both results and rejection attempts even with a broken source', () => {
    expect(rollDice('100d1000+10000', () => 999)).toEqual({
      rolls: Array.from({ length: 100 }, () => 1000),
      total: 110_000,
    })
    let attempts = 0
    expect(() =>
      rollDice('1d6', () => {
        attempts++
        return 4_294_967_295
      })
    ).toThrow('indisponible')
    expect(attempts).toBe(128)
    for (const word of [Number.NaN, Infinity, -1, 1.5, 4_294_967_296])
      expect(() => rollDice('1d6', () => word)).toThrow('invalide')
  })
})
