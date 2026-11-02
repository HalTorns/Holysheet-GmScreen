import { describe, expect, it } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import {
  GM_MAX_ITEM_PROFILES,
  GM_MAX_MERCHANT_STOCK,
} from '../../shared/merchants'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

async function setup() {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(backend, 'alice@example.test')
  const bob = await createAuthenticatedUser(backend, 'bob@example.test')
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'Catalogue',
  })
  const create = (title: string, kind: 'merchant' | 'item' | 'npc') =>
    alice.client.mutation(api.gmSheets.createSheet, { projectId, title, kind })
  const itemId = await create('Potion', 'item')
  const merchantId = await create('Alchimiste', 'merchant')
  const second = await create('Épicier', 'merchant')
  const add = (merchant = merchantId) =>
    alice.client.mutation(api.merchants.addStock, {
      merchantId: merchant,
      itemId,
    })
  const stock = (merchant = merchantId) =>
    alice.client.query(api.merchants.getStock, { merchantId: merchant })
  const profile = (price: number, expectedVersion = 0) =>
    alice.client.mutation(api.items.setProfile, {
      sheetId: itemId,
      price,
      currency: 'po',
      category: 'Potion',
      expectedVersion,
    })
  const changeKind = (id: typeof itemId) =>
    alice.client.mutation(api.gmSheets.updateSheet, {
      id,
      expectedVersion: 0,
      kind: 'npc',
      title: 'Nouveau',
      summary: '',
      body: '',
      fields: [],
    })
  return {
    backend,
    alice,
    bob,
    projectId,
    create,
    itemId,
    merchantId,
    second,
    add,
    stock,
    profile,
    changeKind,
  }
}

describe('F7 catalogue et stock, vraies entrées publiques', () => {
  it('partage le modèle, isole quantités, applique la priorité et permet de revenir au prix partagé', async () => {
    const { alice, second, add, stock, profile, itemId } = await setup()
    const id = await add()
    await add(second)
    await profile(10)
    await profile(12.5, 1)
    expect((await stock())[0]?.effectivePrice).toBe(12.5)
    expect((await stock(second))[0]?.effectivePrice).toBe(12.5)
    await alice.client.mutation(api.merchants.updateStock, {
      id,
      expectedVersion: 0,
      quantity: 8,
      price: 15,
      available: false,
    })
    expect((await stock())[0]).toMatchObject({
      quantity: 8,
      available: false,
      effectivePrice: 15,
    })
    expect((await stock(second))[0]).toMatchObject({
      quantity: 1,
      effectivePrice: 12.5,
    })
    await alice.client.mutation(api.merchants.updateStock, {
      id,
      expectedVersion: 1,
      quantity: 8,
      available: true,
    })
    expect((await stock())[0]?.effectivePrice).toBe(12.5)
    const sellers = await alice.client.query(api.items.sellers, {
      sheetId: itemId,
      paginationOpts: { cursor: null, numItems: 1 },
    })
    expect(sellers.page).toHaveLength(1)
    expect(sellers.isDone).toBe(false)
    await expect(profile(20, 0)).rejects.toThrow('CONFLICT')
  })

  it('additionne les ventes concurrentes, borne à zéro, incrémente la version et refuse une édition périmée', async () => {
    const { alice, add, stock } = await setup()
    const id = await add()
    await alice.client.mutation(api.merchants.updateStock, {
      id,
      expectedVersion: 0,
      quantity: 5,
      available: true,
    })
    await Promise.all(
      [-1, -1].map((delta) =>
        alice.client.mutation(api.merchants.adjustQuantity, { id, delta })
      )
    )
    expect((await stock())[0]).toMatchObject({ quantity: 3, version: 3 })
    await expect(
      alice.client.mutation(api.merchants.updateStock, {
        id,
        expectedVersion: 1,
        quantity: 5,
        available: true,
      })
    ).rejects.toThrow('CONFLICT')
    await alice.client.mutation(api.merchants.adjustQuantity, {
      id,
      delta: -10,
    })
    expect((await stock())[0]).toMatchObject({ quantity: 0, version: 4 })
    await alice.client.mutation(api.merchants.adjustQuantity, { id, delta: -1 })
    expect((await stock())[0]?.version).toBe(4)
    await alice.client.mutation(api.merchants.updateStock, {
      id,
      expectedVersion: 4,
      quantity: null,
      available: true,
    })
    await alice.client.mutation(api.merchants.adjustQuantity, { id, delta: -1 })
    expect((await stock())[0]).toMatchObject({ quantity: null, version: 5 })
  })

  it('protège le kind via updateSheet et retire atomiquement un profil sans stock', async () => {
    const { alice, itemId, merchantId, add, profile, changeKind } =
      await setup()
    await profile(10)
    const id = await add()
    for (const sheetId of [itemId, merchantId])
      await expect(changeKind(sheetId)).rejects.toThrow('SHEET_KIND_IN_USE')
    await alice.client.mutation(api.merchants.removeStock, { id })
    await changeKind(itemId)
    await expect(
      alice.client.query(api.items.getProfile, { sheetId: itemId })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      alice.client.query(api.gm.exportCollection, {
        collection: 'gmItemProfiles',
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).resolves.toMatchObject({ page: [] })
  })

  it('refuse tiers, autre projet, mauvais kind, doublon et entrées invalides', async () => {
    const { alice, bob, itemId, merchantId, create, add, profile } =
      await setup()
    const id = await add()
    await expect(add()).rejects.toThrow('STOCK_DUPLICATE')
    const npc = await create('PNJ', 'npc')
    for (const pair of [
      { merchantId: npc, itemId },
      { merchantId, itemId: npc },
    ])
      await expect(
        alice.client.mutation(api.merchants.addStock, pair)
      ).rejects.toThrow('NOT_FOUND')
    const elsewhere = await alice.client.mutation(api.gm.createProject, {
      title: 'Ailleurs',
    })
    const foreign = await alice.client.mutation(api.gmSheets.createSheet, {
      projectId: elsewhere,
      kind: 'item',
      title: 'Étranger',
    })
    await expect(
      alice.client.mutation(api.merchants.addStock, {
        merchantId,
        itemId: foreign,
      })
    ).rejects.toThrow('NOT_FOUND')
    for (const client of [bob.client, createBackendTest()]) {
      await expect(
        client.query(api.merchants.getStock, { merchantId })
      ).rejects.toThrow()
      await expect(
        client.query(api.items.getProfile, { sheetId: itemId })
      ).rejects.toThrow()
      await expect(
        client.mutation(api.merchants.adjustQuantity, { id, delta: -1 })
      ).rejects.toThrow()
    }
    await expect(
      bob.client.mutation(api.merchants.addStock, { merchantId, itemId })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.items.setProfile, {
        sheetId: itemId,
        expectedVersion: 0,
        currency: '',
        category: '',
      })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.merchants.updateStock, {
        id,
        expectedVersion: 0,
        quantity: 2,
        available: true,
      })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.merchants.removeStock, { id })
    ).rejects.toThrow('NOT_FOUND')
    await expect(
      bob.client.mutation(api.merchants.reorderStock, { merchantId, ids: [id] })
    ).rejects.toThrow('NOT_FOUND')
    for (const price of [-1, 0.001, Number.POSITIVE_INFINITY])
      await expect(profile(price)).rejects.toThrow('INVALID_INPUT')
    for (const quantity of [-1, 1.1, 1_000_001])
      await expect(
        alice.client.mutation(api.merchants.updateStock, {
          id,
          expectedVersion: 0,
          quantity,
          available: true,
        })
      ).rejects.toThrow('INVALID_INPUT')
    await expect(
      alice.client.mutation(api.merchants.adjustQuantity, { id, delta: 0.5 })
    ).rejects.toThrow('INVALID_INPUT')
    await expect(
      alice.client.mutation(api.merchants.reorderStock, {
        merchantId,
        ids: [id, id],
      })
    ).rejects.toThrow('INVALID_INPUT')
  })

  it('refuse les limites, corbeille comprise', async () => {
    const { backend, alice, projectId, merchantId, add, profile } =
      await setup()
    await backend.run(async (ctx) => {
      for (let index = 0; index < GM_MAX_MERCHANT_STOCK; index++) {
        const sheetId = await ctx.db.insert('gmSheets', {
          ownerId: alice.userId,
          projectId,
          title: `Objet ${index}`,
          summary: '',
          kind: 'item',
          updatedAt: 0,
          version: 0,
          deletedAt: 1,
        })
        await ctx.db.insert('gmMerchantStock', {
          ownerId: alice.userId,
          projectId,
          merchantId,
          itemId: sheetId,
          quantity: 1,
          available: true,
          order: index,
          version: 0,
        })
      }
      // The profile quota exceeds the current live-sheet quota; seed metadata
      // directly so the defensive project bound remains exercised.
      for (let index = 0; index < GM_MAX_ITEM_PROFILES; index++) {
        const sheetId = await ctx.db.insert('gmSheets', {
          ownerId: alice.userId,
          projectId,
          title: `Modèle ${index}`,
          summary: '',
          kind: 'item',
          updatedAt: 0,
          version: 0,
        })
        await ctx.db.insert('gmItemProfiles', {
          ownerId: alice.userId,
          projectId,
          sheetId,
          currency: '',
          category: '',
          version: 0,
        })
      }
    })
    await expect(add()).rejects.toThrow('STOCK_LIMIT')
    await expect(profile(1)).rejects.toThrow('ITEM_PROFILE_LIMIT')
  })

  it('conserve les relations en corbeille, restaure et purge sans orphelin', async () => {
    const { backend, alice, itemId, merchantId, second, add, stock, profile } =
      await setup()
    await profile(10)
    const id = await add()
    await add(second)
    for (const sheet of [itemId, merchantId]) {
      await alice.client.mutation(api.gmSheets.trashSheet, { id: sheet })
      if (sheet === itemId) expect((await stock())[0]?.item.deleted).toBe(true)
      await expect(
        alice.client.mutation(api.merchants.adjustQuantity, { id, delta: 1 })
      ).rejects.toThrow('NOT_FOUND')
      await alice.client.mutation(api.gmSheets.restoreSheet, { id: sheet })
      expect((await stock())[0]?.item.deleted).toBe(false)
    }
    await alice.client.mutation(api.gmSheets.trashSheet, { id: merchantId })
    await alice.client.mutation(api.gmSheets.deleteSheetForever, {
      id: merchantId,
    })
    expect(await stock(second)).toHaveLength(1)
    await alice.client.mutation(api.gmSheets.trashSheet, { id: itemId })
    await alice.client.mutation(api.gmSheets.deleteSheetForever, { id: itemId })
    expect(await stock(second)).toEqual([])
    expect(
      await backend.run((ctx) => ctx.db.query('gmItemProfiles').collect())
    ).toEqual([])
    expect(
      await backend.run((ctx) => ctx.db.query('gmMerchantStock').collect())
    ).toEqual([])
  })

  it('réordonne, exporte par propriétaire et nettoie les deux tables en plusieurs lots', async () => {
    const {
      backend,
      alice,
      bob,
      itemId,
      merchantId,
      projectId,
      create,
      add,
      profile,
      stock,
    } = await setup()
    await profile(1)
    const first = await add()
    const otherItem = await create('Corde', 'item')
    const other = await alice.client.mutation(api.merchants.addStock, {
      merchantId,
      itemId: otherItem,
    })
    await alice.client.mutation(api.merchants.reorderStock, {
      merchantId,
      ids: [other, first],
    })
    expect((await stock()).map((row) => row._id)).toEqual([other, first])
    await backend.run(async (ctx) => {
      for (let index = 0; index < 25; index++) {
        const seller = await ctx.db.insert('gmSheets', {
          ownerId: alice.userId,
          projectId,
          title: 'Marchand',
          summary: '',
          kind: 'merchant',
          updatedAt: 0,
          version: 0,
        })
        await ctx.db.insert('gmMerchantStock', {
          ownerId: alice.userId,
          projectId,
          merchantId: seller,
          itemId,
          quantity: null,
          available: true,
          version: 0,
          order: 0,
        })
      }
    })
    for (const collection of ['gmItemProfiles', 'gmMerchantStock'] as const) {
      expect(
        (
          await alice.client.query(api.gm.exportCollection, {
            collection,
            paginationOpts: { cursor: null, numItems: 50 },
          })
        ).page.length
      ).toBeGreaterThan(0)
      expect(
        (
          await bob.client.query(api.gm.exportCollection, {
            collection,
            paginationOpts: { cursor: null, numItems: 50 },
          })
        ).page
      ).toEqual([])
    }
    await backend.mutation(internal.cleanup.deletedAccount, {
      userId: alice.userId,
      email: 'alice@example.test',
    })
    await backend.finishAllScheduledFunctions(() => undefined)
    expect(
      await backend.run((ctx) => ctx.db.query('gmMerchantStock').collect())
    ).toEqual([])
    expect(
      await backend.run((ctx) => ctx.db.query('gmItemProfiles').collect())
    ).toEqual([])
  })
})
