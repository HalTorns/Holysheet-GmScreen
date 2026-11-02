// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  archiveInventory,
  compareInventories,
} from '../../scripts/snapshots.mjs'

test('F7 ZIP inventory validates shared stock and rejects broken existence, kind, project, owner and uniqueness', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'f7-snapshot-'))
  const common = { ownerId: 'owner', projectId: 'project' }
  const profile = {
    ...common,
    _id: 'profile',
    sheetId: 'item',
    currency: 'po',
    category: 'Potion',
    version: 0,
  }
  const row = {
    ...common,
    _id: 'stock',
    merchantId: 'merchant',
    itemId: 'item',
    quantity: 3,
    available: true,
    order: 0,
    version: 0,
  }
  const tables: Record<string, unknown[]> = {
    gmProjects: [{ _id: 'project', ownerId: 'owner' }],
    gmSheets: [
      { ...common, _id: 'item', kind: 'item' },
      { ...common, _id: 'merchant', kind: 'merchant' },
      { ...common, _id: 'second', kind: 'merchant' },
    ],
    gmItemProfiles: [profile],
    gmMerchantStock: [row, { ...row, _id: 'stock2', merchantId: 'second' }],
  }
  async function inventory(name: string) {
    for (const [table, rows] of Object.entries(tables)) {
      await mkdir(join(directory, table), { recursive: true })
      await writeFile(
        join(directory, table, 'documents.jsonl'),
        rows.map((entry) => JSON.stringify(entry)).join('\n')
      )
    }
    const path = join(directory, `${name}.zip`)
    execFileSync('zip', ['-qr', path, ...Object.keys(tables)], {
      cwd: directory,
    })
    return archiveInventory(path)
  }
  try {
    const source = await inventory('source')
    expect(source.widgetRelations).toMatchObject({
      valid: true,
      itemProfiles: 1,
      stockLines: 2,
      sharedStockItems: 1,
    })
    compareInventories(source, await inventory('restored'))
    for (const patch of [
      { itemId: 'missing' },
      { itemId: 'merchant' },
      { projectId: 'foreign' },
      { ownerId: 'foreign' },
    ]) {
      tables.gmMerchantStock = [{ ...row, ...patch }]
      await expect(inventory(crypto.randomUUID())).rejects.toThrow(
        'merchant stock relations'
      )
    }
    tables.gmMerchantStock = [row, { ...row, _id: 'duplicate' }]
    await expect(inventory('duplicate')).rejects.toThrow(
      'merchant stock relations'
    )
    tables.gmMerchantStock = [row]
    for (const patch of [
      { sheetId: 'missing' },
      { sheetId: 'merchant' },
      { projectId: 'foreign' },
      { ownerId: 'foreign' },
    ]) {
      tables.gmItemProfiles = [{ ...profile, ...patch }]
      await expect(inventory(crypto.randomUUID())).rejects.toThrow(
        'merchant stock relations'
      )
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
