import { describe, expect, it } from 'vitest'

import { defaultWidgetStyle, resolveWidgetStyle } from '../../shared/gm'

const legacy = {
  ...defaultWidgetStyle,
  background: '#ffffff',
  color: '#202a24',
  borderColor: '#d6d9d4',
}

describe('resolveWidgetStyle', () => {
  it('remplace en bloc la palette claire d’origine, quelle que soit la casse', () => {
    for (const style of [
      legacy,
      {
        ...legacy,
        background: '#FFFFFF',
        color: '#202A24',
        borderColor: '#D6D9D4',
      },
    ])
      expect(resolveWidgetStyle(style)).toEqual(defaultWidgetStyle)
  })

  it('conserve entière une palette dont une couleur a été choisie', () => {
    const darkText = { ...legacy, color: '#222222' }
    const cream = { ...legacy, background: '#faf7f0' }
    expect(resolveWidgetStyle(darkText)).toEqual(darkText)
    expect(resolveWidgetStyle(cream)).toEqual(cream)
  })

  it('une modification sans rapport conserve la palette mixte', () => {
    // Fusion faite par patchStyle : style résolu, puis changements.
    const mixed = { ...legacy, color: '#222222' }
    expect({ ...resolveWidgetStyle(mixed), fontSize: 20 }).toEqual({
      ...mixed,
      fontSize: 20,
    })
  })

  it('laisse les champs non colorés inchangés', () => {
    const style = {
      ...legacy,
      fontFamily: 'mono',
      fontSize: 22,
      radius: 0,
      opacity: 60,
    } as const
    expect(resolveWidgetStyle(style)).toMatchObject({
      fontFamily: 'mono',
      fontSize: 22,
      radius: 0,
      opacity: 60,
    })
  })
})
