import { describe, expect, it } from 'vitest'

import { definitionFrom } from '../../src/features/gm/variable-input'

describe('definitionFrom', () => {
  it('refuse une saisie numérique vide plutôt que de la convertir en zéro', () => {
    for (const input of ['', '   '])
      expect(definitionFrom('number', input)).toEqual({
        error: 'Saisissez un nombre fini.',
      })
  })

  it('refuse les conversions non finies', () => {
    for (const input of ['Infinity', '-Infinity', 'NaN', '9'.repeat(309)])
      expect(definitionFrom('number', input)).toHaveProperty('error')
  })

  it('conserve zéro, les décimaux et les autres types', () => {
    expect(definitionFrom('number', '0')).toEqual({
      definition: { type: 'number', value: 0 },
    })
    expect(definitionFrom('number', '-2.5')).toEqual({
      definition: { type: 'number', value: -2.5 },
    })
    expect(definitionFrom('text', '')).toEqual({
      definition: { type: 'text', value: '' },
    })
    expect(definitionFrom('boolean', 'false')).toEqual({
      definition: { type: 'boolean', value: false },
    })
    expect(definitionFrom('formula', 'force + 1')).toEqual({
      definition: { type: 'formula', expression: 'force + 1' },
    })
  })
})
