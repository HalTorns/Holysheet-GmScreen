import { describe, expect, it } from 'vitest'

import { reconcileDraft } from '../../src/features/gm/sheet-draft'

describe('reconcileDraft (F1-01)', () => {
  it('ne remplace pas une saisie faite pendant un enregistrement', () => {
    // A enregistré, B envoyé, l'utilisateur revient à A avant l'accusé.
    const base = { version: 0, draft: 'A' }
    const server = { version: 1, draft: 'B' }
    expect(
      reconcileDraft({ base, draft: 'A', saving: true }, server)
    ).toBeNull()
    // Après l'accusé, la base devient la version soumise (B) : A est un
    // brouillon modifié et reste intact.
    const acknowledged = { version: 1, draft: 'B' }
    expect(
      reconcileDraft({ base: acknowledged, draft: 'A', saving: false }, server)
    ).toBeNull()
  })

  it('suit le serveur quand le brouillon est intact', () => {
    const base = { version: 0, draft: 'A' }
    const server = { version: 1, draft: 'C' }
    expect(reconcileDraft({ base, draft: 'A', saving: false }, server)).toEqual(
      server
    )
  })

  it('conserve un brouillon modifié face à une version distante', () => {
    const base = { version: 0, draft: 'A' }
    expect(
      reconcileDraft(
        { base, draft: 'A modifié', saving: false },
        { version: 1, draft: 'C' }
      )
    ).toBeNull()
  })
})
