import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import { GM_MAX_VARIABLES } from '../../shared/gm'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

async function setup() {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'alice@example.test')
  const bob = await createAuthenticatedUser(backend, 'bob@example.test')
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'Campagne',
  })
  const number = (name: string, value: number, bounds = {}) =>
    alice.client.mutation(api.gmVariables.createVariable, {
      projectId,
      name,
      label: name,
      definition: { type: 'number', value, ...bounds },
    })
  const formula = (name: string, expression: string) =>
    alice.client.mutation(api.gmVariables.createVariable, {
      projectId,
      name,
      label: name,
      definition: { type: 'formula', expression },
    })
  const computed = async () =>
    Object.fromEntries(
      (
        await alice.client.query(api.gmVariables.listVariables, { projectId })
      ).map(({ variable, computed: result }) => [variable.name, result])
    )
  return { backend, alice, bob, projectId, number, formula, computed }
}

describe('Variables et formules du projet (F2)', () => {
  it('crée chaque type, calcule les formules et recalcule après une écriture rapide', async () => {
    const { alice, projectId, number, formula, computed } = await setup()
    const force = await number('force', 3)
    await formula('bonus', 'Force * 2 + 1')
    await alice.client.mutation(api.gmVariables.createVariable, {
      projectId,
      name: 'nom',
      label: 'Nom du héros',
      definition: { type: 'text', value: 'Aldric' },
    })
    await alice.client.mutation(api.gmVariables.createVariable, {
      projectId,
      name: 'blesse',
      label: 'Blessé',
      definition: { type: 'boolean', value: false },
    })
    expect(await computed()).toMatchObject({
      force: { value: 3 },
      bonus: { value: 7 },
      nom: { value: 'Aldric' },
      blesse: { value: false },
    })
    await alice.client.mutation(api.gmVariables.setVariableValue, {
      id: force,
      value: 5,
    })
    expect((await computed()).bonus).toEqual({ value: 11 })
    await expect(
      alice.client.mutation(api.gmVariables.setVariableValue, {
        id: force,
        value: 'cinq',
      })
    ).rejects.toThrow('INVALID_INPUT')
  })

  it('refuse les noms invalides et les doublons insensibles à la casse', async () => {
    const { number } = await setup()
    await number('force', 1)
    for (const name of ['', '1abc', 'a-b', 'é', 'x'.repeat(41)])
      await expect(number(name, 1)).rejects.toThrow('INVALID_INPUT')
    await expect(number('FORCE', 1)).rejects.toThrow('NAME_TAKEN')
  })

  it('applique les bornes min et max', async () => {
    const { alice, number } = await setup()
    await expect(number('pv', 11, { min: 0, max: 10 })).rejects.toThrow(
      'OUT_OF_RANGE'
    )
    await expect(number('pv', 1, { min: 5, max: 2 })).rejects.toThrow(
      'INVALID_INPUT'
    )
    const pv = await number('pv', 10, { min: 0, max: 10 })
    await expect(
      alice.client.mutation(api.gmVariables.setVariableValue, {
        id: pv,
        value: -1,
      })
    ).rejects.toThrow('OUT_OF_RANGE')
  })

  it('refuse les formules invalides et les cycles, à la création et à la mise à jour', async () => {
    const { alice, formula, number } = await setup()
    await expect(formula('a', '1 +')).rejects.toThrow('INVALID_FORMULA')
    await expect(formula('a', 'a + 1')).rejects.toThrow('CYCLE')
    await formula('a', 'b + 1')
    await formula('b', 'c + 1')
    await expect(formula('c', 'a + 1')).rejects.toThrow('CYCLE')
    const c = await number('c', 2)
    await expect(
      alice.client.mutation(api.gmVariables.updateVariable, {
        id: c,
        expectedVersion: 0,
        name: 'c',
        label: 'c',
        definition: { type: 'formula', expression: 'a * 2' },
      })
    ).rejects.toThrow('CYCLE')
  })

  it('refuse le renommage et la suppression d’une variable référencée', async () => {
    const { alice, number, formula } = await setup()
    const force = await number('force', 3)
    const bonus = await formula('bonus', 'force + 1')
    const update = (name: string) =>
      alice.client.mutation(api.gmVariables.updateVariable, {
        id: force,
        expectedVersion: 0,
        name,
        label: 'Force',
        definition: { type: 'number', value: 3 },
      })
    await expect(update('vigueur')).rejects.toThrow('REFERENCED')
    await expect(
      alice.client.mutation(api.gmVariables.deleteVariable, { id: force })
    ).rejects.toThrow('REFERENCED')
    await expect(update('Force')).resolves.toBe(1)
    await alice.client.mutation(api.gmVariables.deleteVariable, { id: bonus })
    await alice.client.mutation(api.gmVariables.deleteVariable, { id: force })
  })

  it('renvoie CONFLICT à un éditeur resté avant une écriture rapide', async () => {
    const { alice, number } = await setup()
    const force = await number('force', 3)
    await alice.client.mutation(api.gmVariables.setVariableValue, {
      id: force,
      value: 4,
    })
    await expect(
      alice.client.mutation(api.gmVariables.updateVariable, {
        id: force,
        expectedVersion: 0,
        name: 'force',
        label: 'Force',
        definition: { type: 'number', value: 3 },
      })
    ).rejects.toThrow('CONFLICT')
  })

  it('borne le nombre de variables par projet', async () => {
    const { backend, alice, projectId, number } = await setup()
    await backend.run(async (ctx) => {
      for (let index = 0; index < GM_MAX_VARIABLES; index++)
        await ctx.db.insert('gmVariables', {
          ownerId: alice.userId,
          projectId,
          updatedAt: Date.now(),
          name: `v${index}`,
          nameKey: `v${index}`,
          label: '',
          version: 0,
          type: 'number',
          value: index,
        })
    })
    await expect(number('deTrop', 1)).rejects.toThrow('VARIABLE_LIMIT')
  })

  it('refuse chaque entrée publique à un autre compte', async () => {
    const { bob, projectId, number } = await setup()
    const id: Id<'gmVariables'> = await number('secret', 1)
    await expect(
      bob.client.query(api.gmVariables.listVariables, { projectId })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.gmVariables.createVariable, {
        projectId,
        name: 'intrus',
        label: '',
        definition: { type: 'number', value: 1 },
      })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.gmVariables.updateVariable, {
        id,
        expectedVersion: 0,
        name: 'secret',
        label: '',
        definition: { type: 'number', value: 2 },
      })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.gmVariables.setVariableValue, { id, value: 2 })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.gmVariables.deleteVariable, { id })
    ).rejects.toThrow('NOT_FOUND')
  })

  it('exporte et nettoie les variables avec le compte', async () => {
    const { backend, alice, bob, number } = await setup()
    await number('force', 3)
    const exported = await alice.client.query(api.gm.exportCollection, {
      collection: 'gmVariables',
      paginationOpts: { numItems: 50, cursor: null },
    })
    expect(exported.page).toHaveLength(1)
    expect(
      (
        await bob.client.query(api.gm.exportCollection, {
          collection: 'gmVariables',
          paginationOpts: { numItems: 50, cursor: null },
        })
      ).page
    ).toEqual([])
    await backend.mutation(internal.cleanup.deletedAccount, {
      userId: alice.userId,
      email: 'alice@example.test',
    })
    await backend.finishAllScheduledFunctions(() => undefined)
    expect(
      await backend.run((ctx) => ctx.db.query('gmVariables').collect())
    ).toEqual([])
  })
})
