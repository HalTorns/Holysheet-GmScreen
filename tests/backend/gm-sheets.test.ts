import type { FunctionReturnType } from 'convex/server'
import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import {
  GM_MAX_SHEETS,
  GM_MAX_SHEET_FIELDS,
  GM_MAX_SHEET_LINKS,
  GM_MAX_TRASH,
} from '../../shared/gm'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

type Backend = ReturnType<typeof createBackendTest>

// Contenu maximal en caractères de 3 octets : le pire cas des budgets de
// lecture (docs/PLAN-F1.md, F1-01/F1-02).
const heavyBody = '€'.repeat(50_000)
const heavyFields = Array.from({ length: GM_MAX_SHEET_FIELDS }, (_, i) => ({
  label: `Champ ${i}`,
  value: '€'.repeat(2000),
}))

async function setup() {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'alice@example.test')
  const bob = await createAuthenticatedUser(backend, 'bob@example.test')
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'Campagne',
  })
  const create = (title: string, kind: 'npc' | 'place' = 'npc') =>
    alice.client.mutation(api.gmSheets.createSheet, { projectId, kind, title })
  return { backend, alice, bob, projectId, create }
}

// Insère directement des fiches (métadonnées + contenu) pour tester les
// bornes sans passer par le quota d'écriture par utilisateur.
function insertSheets(
  backend: Backend,
  ownerId: string,
  projectId: Id<'gmProjects'>,
  count: number,
  options: { heavy?: boolean; deletedAt?: number } = {}
) {
  return backend.run(async (ctx) => {
    const ids: Id<'gmSheets'>[] = []
    for (let index = 0; index < count; index++) {
      const common = { ownerId, projectId, updatedAt: Date.now() }
      const sheetId = await ctx.db.insert('gmSheets', {
        ...common,
        kind: 'npc',
        title: `Fiche ${index}`,
        summary: '',
        version: 0,
        ...(options.deletedAt ? { deletedAt: options.deletedAt } : {}),
      })
      await ctx.db.insert('gmSheetContents', {
        ...common,
        sheetId,
        body: options.heavy ? heavyBody : '',
        fields: options.heavy ? heavyFields : [],
      })
      ids.push(sheetId)
    }
    return ids
  })
}

describe('Bibliothèque de fiches (F1)', () => {
  it('crée, édite avec versions et refuse un enregistrement obsolète', async () => {
    const { alice, projectId, create } = await setup()
    const id = await create(' Aldric ')
    const version = await alice.client.mutation(api.gmSheets.updateSheet, {
      id,
      expectedVersion: 0,
      kind: 'merchant',
      title: 'Aldric le marchand',
      summary: 'Vend des potions',
      body: 'Ouvre à l’aube.',
      fields: [{ label: 'Ville', value: 'Port-Sel' }],
    })
    expect(version).toBe(1)
    const sheet = await alice.client.query(api.gmSheets.getSheet, { id })
    expect(sheet).toMatchObject({
      sheet: { title: 'Aldric le marchand', kind: 'merchant', version: 1 },
      body: 'Ouvre à l’aube.',
      fields: [{ label: 'Ville', value: 'Port-Sel' }],
    })
    await expect(
      alice.client.mutation(api.gmSheets.updateSheet, {
        id,
        expectedVersion: 0,
        kind: 'npc',
        title: 'Ancien brouillon',
        summary: '',
        body: '',
        fields: [],
      })
    ).rejects.toThrow('CONFLICT')
    const list = await alice.client.query(api.gmSheets.listSheets, {
      projectId,
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(list.page.map((s) => s.title)).toEqual(['Aldric le marchand'])
    const merchants = await alice.client.query(api.gmSheets.listSheets, {
      projectId,
      kind: 'merchant',
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(merchants.page).toHaveLength(1)
  })

  it('valide les bornes du contenu', async () => {
    const { alice, create } = await setup()
    const id = await create('Bornes')
    const base = {
      id,
      expectedVersion: 0,
      kind: 'npc' as const,
      title: 'Bornes',
      summary: '',
      body: '',
      fields: [] as { label: string; value: string }[],
    }
    for (const invalid of [
      { title: '' },
      { title: 'x'.repeat(121) },
      { summary: 'x'.repeat(501) },
      { body: 'x'.repeat(50_001) },
      { fields: [{ label: '', value: 'v' }] },
      { fields: [{ label: 'x'.repeat(61), value: 'v' }] },
      { fields: [{ label: 'l', value: 'x'.repeat(2001) }] },
      {
        fields: Array.from({ length: GM_MAX_SHEET_FIELDS + 1 }, () => ({
          label: 'l',
          value: 'v',
        })),
      },
    ])
      await expect(
        alice.client.mutation(api.gmSheets.updateSheet, { ...base, ...invalid })
      ).rejects.toThrow('INVALID_INPUT')
    await expect(
      alice.client.mutation(api.gmSheets.updateSheet, {
        ...base,
        body: heavyBody,
        fields: heavyFields,
      })
    ).resolves.toBe(1)
  })

  it('compte la limite de fiches sans lire les contenus, même pleins', async () => {
    const { backend, alice, projectId, create } = await setup()
    await insertSheets(backend, alice.userId, projectId, 60, { heavy: true })
    await insertSheets(backend, alice.userId, projectId, GM_MAX_SHEETS - 61)
    await expect(create('Dernière')).resolves.toBeDefined()
    await expect(create('De trop')).rejects.toThrow('SHEET_LIMIT')
  })

  it('relie les fiches, montre les rétroliens et refuse les liens invalides', async () => {
    const { alice, bob, create } = await setup()
    const tavern = await create('Taverne', 'place')
    const host = await create('Aubergiste')
    const thief = await create('Voleur')
    for (const target of [tavern, thief, tavern])
      await alice.client.mutation(api.gmSheets.addSheetLink, {
        id: host,
        target,
      })
    const tavernView = await alice.client.query(api.gmSheets.getSheet, {
      id: tavern,
    })
    expect(tavernView?.backlinks.map((s) => s._id)).toEqual([host])
    const hostView = await alice.client.query(api.gmSheets.getSheet, {
      id: host,
    })
    expect(hostView?.links.map((s) => s._id).sort()).toEqual(
      [tavern, thief].sort()
    )
    await alice.client.mutation(api.gmSheets.removeSheetLink, {
      id: host,
      target: thief,
    })
    expect(
      (await alice.client.query(api.gmSheets.getSheet, { id: host }))?.links
    ).toHaveLength(1)

    const otherProject = await alice.client.mutation(api.gm.createProject, {
      title: 'Autre',
    })
    const elsewhere = await alice.client.mutation(api.gmSheets.createSheet, {
      projectId: otherProject,
      kind: 'npc',
      title: 'Ailleurs',
    })
    const bobProject = await bob.client.mutation(api.gm.createProject, {
      title: 'Bob',
    })
    const bobSheet = await bob.client.mutation(api.gmSheets.createSheet, {
      projectId: bobProject,
      kind: 'npc',
      title: 'Bob',
    })
    await expect(
      alice.client.mutation(api.gmSheets.addSheetLink, {
        id: host,
        target: host,
      })
    ).rejects.toThrow('INVALID_INPUT')
    for (const target of [elsewhere, bobSheet])
      await expect(
        alice.client.mutation(api.gmSheets.addSheetLink, { id: host, target })
      ).rejects.toThrow('NOT_FOUND')
    await alice.client.mutation(api.gmSheets.trashSheet, { id: thief })
    await expect(
      alice.client.mutation(api.gmSheets.addSheetLink, {
        id: host,
        target: thief,
      })
    ).rejects.toThrow('NOT_FOUND')
  })

  it('refuse plus de 50 liens sortants, liens masqués compris', async () => {
    const { backend, alice, projectId, create } = await setup()
    const source = await create('Source')
    const live = await insertSheets(
      backend,
      alice.userId,
      projectId,
      GM_MAX_SHEET_LINKS
    )
    const [hidden] = await insertSheets(backend, alice.userId, projectId, 1, {
      deletedAt: Date.now(),
    })
    // 49 liens vivants et 1 lien masqué (cible en corbeille) : la borne est
    // atteinte même si l'interface n'en montre que 49.
    await backend.run(async (ctx) => {
      for (const toId of [...live.slice(0, GM_MAX_SHEET_LINKS - 1), hidden])
        if (toId)
          await ctx.db.insert('gmSheetLinks', {
            ownerId: alice.userId,
            projectId,
            fromId: source,
            toId,
            updatedAt: Date.now(),
          })
    })
    const extra = live.at(-1)
    if (!extra) throw new Error('Missing extra target')
    await expect(
      alice.client.mutation(api.gmSheets.addSheetLink, {
        id: source,
        target: extra,
      })
    ).rejects.toThrow('LINK_LIMIT')
    expect(
      (await alice.client.query(api.gmSheets.getSheet, { id: source }))?.links
    ).toHaveLength(GM_MAX_SHEET_LINKS - 1)
  })

  it('conserve un lien vers une fiche en corbeille quand on édite les autres liens', async () => {
    const { alice, create } = await setup()
    const a = await create('A')
    const b = await create('B')
    const c = await create('C')
    const d = await create('D')
    for (const target of [b, c])
      await alice.client.mutation(api.gmSheets.addSheetLink, { id: a, target })
    await alice.client.mutation(api.gmSheets.trashSheet, { id: b })
    await alice.client.mutation(api.gmSheets.removeSheetLink, {
      id: a,
      target: c,
    })
    await alice.client.mutation(api.gmSheets.addSheetLink, { id: a, target: d })
    await alice.client.mutation(api.gmSheets.restoreSheet, { id: b })
    expect(
      (await alice.client.query(api.gmSheets.getSheet, { id: a }))?.links
        .map((s) => s._id)
        .sort()
    ).toEqual([b, d].sort())
  })

  it('met à la corbeille, masque les liens, restaure et supprime définitivement', async () => {
    const { backend, alice, projectId, create } = await setup()
    const a = await create('A')
    const b = await create('B')
    await alice.client.mutation(api.gmSheets.addSheetLink, { id: a, target: b })
    await alice.client.mutation(api.gmSheets.trashSheet, { id: b })
    expect(
      (await alice.client.query(api.gmSheets.getSheet, { id: a }))?.links
    ).toEqual([])
    const trash = await alice.client.query(api.gmSheets.listSheets, {
      projectId,
      trashed: true,
      paginationOpts: { numItems: 10, cursor: null },
    })
    expect(trash.page.map((s) => s._id)).toEqual([b])
    await expect(
      alice.client.mutation(api.gmSheets.deleteSheetForever, { id: a })
    ).rejects.toThrow('NOT_IN_TRASH')
    await alice.client.mutation(api.gmSheets.restoreSheet, { id: b })
    expect(
      (await alice.client.query(api.gmSheets.getSheet, { id: a }))?.links
    ).toHaveLength(1)
    await alice.client.mutation(api.gmSheets.trashSheet, { id: b })
    await alice.client.mutation(api.gmSheets.deleteSheetForever, { id: b })
    expect(
      await alice.client.query(api.gmSheets.getSheet, { id: b })
    ).toBeNull()
    const remaining = await backend.run((ctx) =>
      ctx.db.query('gmSheetLinks').collect()
    )
    expect(remaining).toEqual([])
  })

  it('supprime définitivement une fiche ciblée par plus de 499 sources, vivantes ou en corbeille', async () => {
    const { backend, alice, projectId, create } = await setup()
    const target = await create('Cible')
    const live = await insertSheets(backend, alice.userId, projectId, 450)
    const trashed = await insertSheets(
      backend,
      alice.userId,
      projectId,
      GM_MAX_TRASH - 1,
      { deletedAt: Date.now() }
    )
    await backend.run(async (ctx) => {
      for (const fromId of [...live, ...trashed])
        await ctx.db.insert('gmSheetLinks', {
          ownerId: alice.userId,
          projectId,
          fromId,
          toId: target,
          updatedAt: Date.now(),
        })
    })
    await alice.client.mutation(api.gmSheets.trashSheet, { id: target })
    await alice.client.mutation(api.gmSheets.deleteSheetForever, {
      id: target,
    })
    const orphans = await backend.run((ctx) =>
      ctx.db
        .query('gmSheetLinks')
        .withIndex('by_to', (q) => q.eq('toId', target))
        .collect()
    )
    expect(orphans).toEqual([])
  })

  it('cherche uniquement dans les fiches vivantes du projet', async () => {
    const { alice, bob, projectId, create } = await setup()
    await create('Dragon rouge')
    const gone = await create('Dragon noir')
    await alice.client.mutation(api.gmSheets.trashSheet, { id: gone })
    const other = await alice.client.mutation(api.gm.createProject, {
      title: 'Autre',
    })
    await alice.client.mutation(api.gmSheets.createSheet, {
      projectId: other,
      kind: 'monster',
      title: 'Dragon bleu',
    })
    const found = await alice.client.query(api.gmSheets.searchSheets, {
      projectId,
      text: 'Dragon',
    })
    expect(found.map((s) => s.title)).toEqual(['Dragon rouge'])
    expect(
      await alice.client.query(api.gmSheets.searchSheets, {
        projectId,
        text: '   ',
      })
    ).toEqual([])
    await expect(
      bob.client.query(api.gmSheets.searchSheets, { projectId, text: 'Dragon' })
    ).rejects.toThrow('NOT_FOUND')
  })

  it('refuse chaque entrée publique à un autre compte', async () => {
    const { alice, bob, projectId, create } = await setup()
    const id = await create('Secret')
    const target = await create('Autre secret')
    const page = { paginationOpts: { numItems: 10, cursor: null } }
    await expect(
      bob.client.query(api.gmSheets.listSheets, { projectId, ...page })
    ).rejects.toThrow('NOT_FOUND')
    expect(await bob.client.query(api.gmSheets.getSheet, { id })).toBeNull()
    await expect(
      bob.client.mutation(api.gmSheets.createSheet, {
        projectId,
        kind: 'npc',
        title: 'Intrus',
      })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.gmSheets.updateSheet, {
        id,
        expectedVersion: 0,
        kind: 'npc',
        title: 'Volé',
        summary: '',
        body: '',
        fields: [],
      })
    ).rejects.toThrow('NOT_FOUND')
    for (const fn of [api.gmSheets.addSheetLink, api.gmSheets.removeSheetLink])
      await expect(bob.client.mutation(fn, { id, target })).rejects.toThrow(
        'NOT_FOUND'
      )
    for (const fn of [
      api.gmSheets.trashSheet,
      api.gmSheets.restoreSheet,
      api.gmSheets.deleteSheetForever,
    ])
      await expect(bob.client.mutation(fn, { id })).rejects.toThrow('NOT_FOUND')
    expect(
      (await alice.client.query(api.gmSheets.getSheet, { id }))?.sheet.title
    ).toBe('Secret')
  })

  it('exporte les trois tables par pages bornées et les nettoie avec le compte', async () => {
    const { backend, alice, bob, projectId, create } = await setup()
    const a = await create('A')
    const b = await create('B')
    await alice.client.mutation(api.gmSheets.addSheetLink, { id: a, target: b })
    await insertSheets(backend, alice.userId, projectId, 12, { heavy: true })
    let cursor: string | null = null
    let isDone = false
    let contents = 0
    while (!isDone) {
      const page: FunctionReturnType<typeof api.gm.exportCollection> =
        await alice.client.query(api.gm.exportCollection, {
          collection: 'gmSheetContents',
          paginationOpts: { numItems: 50, cursor },
        })
      expect(page.page.length).toBeLessThanOrEqual(10)
      contents += page.page.length
      isDone = page.isDone
      cursor = page.continueCursor
    }
    expect(contents).toBe(14)
    for (const collection of ['gmSheets', 'gmSheetLinks'] as const) {
      const exported = await alice.client.query(api.gm.exportCollection, {
        collection,
        paginationOpts: { numItems: 50, cursor: null },
      })
      expect(exported.page.length).toBeGreaterThan(0)
      const leaked = await bob.client.query(api.gm.exportCollection, {
        collection,
        paginationOpts: { numItems: 50, cursor: null },
      })
      expect(leaked.page).toEqual([])
    }

    await backend.mutation(internal.cleanup.deletedAccount, {
      userId: alice.userId,
      email: 'alice@example.test',
    })
    await backend.finishAllScheduledFunctions(() => undefined)
    const left = await backend.run(async (ctx) => ({
      sheets: await ctx.db.query('gmSheets').collect(),
      contents: await ctx.db.query('gmSheetContents').collect(),
      links: await ctx.db.query('gmSheetLinks').collect(),
    }))
    expect(left).toEqual({ sheets: [], contents: [], links: [] })
  })
})
