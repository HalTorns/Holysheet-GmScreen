import { describe, expect, it } from 'vitest'

import type { VariableDefinition } from '../../shared/formula'
import {
  FORMULA_MAX_DEPTH,
  FORMULA_MAX_LENGTH,
  evaluateProject,
  findCycle,
  parseFormula,
} from '../../shared/formula'

function value(
  expression: string,
  variables: Record<string, VariableDefinition> = {}
) {
  const results = evaluateProject([
    ...Object.entries(variables).map(([name, definition]) => ({
      name,
      definition,
    })),
    { name: '__test', definition: { type: 'formula', expression } },
  ])
  return results.get('__test')
}

describe('parseFormula', () => {
  it('respecte les priorités, les unaires et les fonctions', () => {
    expect(value('1 + 2 * 3')).toEqual({ value: 7 })
    expect(value('(1 + 2) * 3')).toEqual({ value: 9 })
    expect(value('10 - 4 - 3')).toEqual({ value: 3 })
    expect(value('-2 * -3')).toEqual({ value: 6 })
    expect(value('7 % 4 + 0.5')).toEqual({ value: 3.5 })
    expect(value('max(1, 5, 3) + min(4, 2) + abs(-1)')).toEqual({ value: 8 })
    expect(value('floor(2.7) + ceil(2.1) + round(2.5)')).toEqual({ value: 8 })
  })

  it('extrait les dépendances normalisées', () => {
    const parsed = parseFormula('Force * 2 + force + bonus_1')
    expect(parsed.ok && parsed.dependencies.sort()).toEqual([
      'bonus_1',
      'force',
    ])
  })

  it('signale les erreurs de syntaxe avec leur position', () => {
    expect(parseFormula('1 +')).toEqual({
      ok: false,
      error: { code: 'UNEXPECTED_END', position: 3 },
    })
    expect(parseFormula('1 $ 2')).toEqual({
      ok: false,
      error: { code: 'UNEXPECTED_CHARACTER', position: 2 },
    })
    expect(parseFormula('(1 + 2')).toMatchObject({
      error: { code: 'UNEXPECTED_END' },
    })
    expect(parseFormula('1 2')).toMatchObject({
      error: { code: 'UNEXPECTED_TOKEN', position: 2 },
    })
    expect(parseFormula('pow(2, 3)')).toMatchObject({
      error: { code: 'UNKNOWN_FUNCTION' },
    })
    expect(parseFormula('abs(1, 2)')).toMatchObject({
      error: { code: 'WRONG_ARITY' },
    })
    expect(parseFormula('max()')).toMatchObject({
      error: { code: 'WRONG_ARITY' },
    })
    expect(parseFormula('   ')).toMatchObject({ error: { code: 'EMPTY' } })
  })

  it('borne la longueur, la profondeur et la complexité', () => {
    expect(parseFormula('1'.repeat(FORMULA_MAX_LENGTH + 1))).toMatchObject({
      error: { code: 'TOO_LONG' },
    })
    const deep = `${'('.repeat(FORMULA_MAX_DEPTH + 2)}1${')'.repeat(FORMULA_MAX_DEPTH + 2)}`
    expect(parseFormula(deep)).toMatchObject({ error: { code: 'TOO_DEEP' } })
    expect(
      parseFormula(Array.from({ length: 120 }, () => '1').join('+'))
    ).toMatchObject({
      error: { code: 'TOO_COMPLEX' },
    })
  })
})

describe('evaluateProject', () => {
  it('calcule à partir des variables et propage les erreurs', () => {
    const vars: Record<string, VariableDefinition> = {
      force: { type: 'number', value: 3 },
      nom: { type: 'text', value: 'Aldric' },
      zero: { type: 'number', value: 0 },
    }
    expect(value('Force * 2 + 1', vars)).toEqual({ value: 7 })
    expect(value('force / zero', vars)).toEqual({ error: 'DIVISION_BY_ZERO' })
    expect(value('nom + 1', vars)).toEqual({ error: 'NOT_A_NUMBER' })
    expect(value('inconnue + 1', vars)).toEqual({ error: 'UNKNOWN_VARIABLE' })
    expect(value(`1${'0'.repeat(300)} * 1${'0'.repeat(10)}`, vars)).toEqual({
      error: 'NON_FINITE',
    })
    const results = evaluateProject([
      { name: 'zero', definition: { type: 'number', value: 0 } },
      {
        name: 'cassee',
        definition: { type: 'formula', expression: '1 / zero' },
      },
      {
        name: 'suivante',
        definition: { type: 'formula', expression: 'cassee + 1' },
      },
    ])
    expect(results.get('suivante')).toEqual({ error: 'DEPENDENCY_ERROR' })
  })

  it('évalue 200 variables et leurs AST associatifs profonds sans récursion entre variables', () => {
    const variables: { name: string; definition: VariableDefinition }[] = [
      { name: 'v0', definition: { type: 'number', value: 0 } },
    ]
    for (let index = 1; index < 200; index++) {
      const expression = `v${index - 1}${'+1'.repeat(99)}`
      expect(parseFormula(expression).ok).toBe(true)
      variables.unshift({
        name: `v${index}`,
        definition: { type: 'formula', expression },
      })
    }
    // L'ordre inverse force le parcours de toute la chaîne avant son calcul.
    expect(evaluateProject(variables).get('v199')).toEqual({
      value: 19_701,
    })
  })

  it('refuse les littéraux débordants, leur négation et leur passage aux fonctions', () => {
    const literal = '9'.repeat(309)
    for (const expression of [literal, `-${literal}`, `abs(${literal})`]) {
      expect(parseFormula(expression).ok).toBe(true)
      expect(value(expression)).toEqual({ error: 'NON_FINITE' })
    }
  })

  it('propage un littéral débordant référencé en DEPENDENCY_ERROR', () => {
    expect(
      value('debordement', {
        debordement: { type: 'formula', expression: '9'.repeat(309) },
      })
    ).toEqual({ error: 'DEPENDENCY_ERROR' })
  })

  it('refuse une valeur numérique non finie et propage son erreur aux références', () => {
    const results = evaluateProject([
      { name: 'source', definition: { type: 'number', value: Infinity } },
      { name: 'ref', definition: { type: 'formula', expression: '-source' } },
    ])
    expect(results.get('source')).toEqual({ error: 'NON_FINITE' })
    expect(results.get('ref')).toEqual({ error: 'DEPENDENCY_ERROR' })
  })

  it('rapporte un cycle déjà stocké sans boucler', () => {
    const results = evaluateProject([
      { name: 'a', definition: { type: 'formula', expression: 'b + 1' } },
      { name: 'b', definition: { type: 'formula', expression: 'c + 1' } },
      { name: 'c', definition: { type: 'formula', expression: 'a + 1' } },
    ])
    for (const name of ['a', 'b', 'c'])
      expect(results.get(name)).toEqual({ error: 'CYCLE' })
  })
})

describe('findCycle', () => {
  it('trouve les cycles directs, indirects et les autoréférences', () => {
    expect(findCycle(new Map([['a', ['a']]]))).toEqual(['a', 'a'])
    expect(
      findCycle(
        new Map([
          ['a', ['b']],
          ['b', ['c']],
          ['c', ['a']],
        ])
      )
    ).toEqual(['a', 'b', 'c', 'a'])
    expect(
      findCycle(
        new Map([
          ['a', ['b', 'c']],
          ['b', ['c']],
          ['c', []],
        ])
      )
    ).toBeNull()
  })
})
