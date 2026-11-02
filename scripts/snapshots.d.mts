type Inventory = {
  tables: Record<string, { count: number; checksum: string }>
  files: Record<string, { bytes: number; checksum: string }>
  widgetRelations: {
    valid: boolean
    customDefinitions: number
    customInstances: number
    fileCount: number
    kinds: string[]
    linkedCounters: number
    availableCounters: number
    checkedItems: number
    payloads: number
    richNotes: number
    plainNoteRevisions: number
    nonEmptyNotes: number
    trashed: number
    revisions: number
  }
}
export function checksum(value: string | Uint8Array): string
export function archiveInventory(path: string): Promise<Inventory>
export function compareInventories(source: Inventory, restored: Inventory): void
