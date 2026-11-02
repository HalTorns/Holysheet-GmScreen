import type { FunctionReturnType } from 'convex/server'

import { internal } from '../../convex/_generated/api'
import type { createBackendTest } from '../backend/fixtures'

export async function widgetInventory(
  backend: ReturnType<typeof createBackendTest>
) {
  const counters: Record<string, number> = {}
  let pages = 0
  for (const table of [
    'gmNotes',
    'gmWidgetContents',
    'gmLayouts',
    'gmEditorHistory',
  ] as const) {
    let cursor: string | null = null
    let offset = 0
    let isDone = false
    while (!isDone) {
      const result: FunctionReturnType<
        typeof internal.gmWidgetMigrations.inventory
      > = await backend.query(internal.gmWidgetMigrations.inventory, {
        table,
        cursor,
        offset,
      })
      for (const [key, value] of Object.entries(result.counters))
        counters[key] = (counters[key] ?? 0) + value
      if (result.samples.length > 3) throw new Error('Unbounded samples')
      cursor = result.continueCursor
      offset = result.offset
      isDone = result.isDone
      pages++
      if (pages > 2000) throw new Error('Inventory did not finish')
    }
  }
  let blocking = 0
  for (const [key, value] of Object.entries(counters))
    if (key !== 'scanned' && key !== 'oldLayoutPurgedReferences')
      blocking += value
  return { counters, blocking, pages }
}
