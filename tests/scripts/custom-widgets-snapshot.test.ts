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

test('F8 archives retain nonempty custom source/state and reject cross-owner/project references', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'f8-snapshot-'))
  const common = { ownerId: 'owner', projectId: 'project' }
  const definition = {
    ...common,
    _id: 'definition',
    name: 'Compteur',
    html: '<output>1</output>',
    css: 'output { color:green; }',
    source: 'widget.setState({count:1})',
    compiled: 'widget.setState({count:1})',
    language: 'js',
    version: 0,
  }
  const widget = {
    ...common,
    _id: 'widget',
    screenId: 'screen',
    formatVersion: 2,
    kind: 'custom',
    config: { definitionId: 'definition', settings: { label: 'Compteur' } },
    state: { count: 7 },
    version: 1,
  }
  const tables: Record<string, unknown[]> = {
    gmProjects: [{ _id: 'project', ownerId: 'owner' }],
    gmCustomWidgets: [definition],
    gmNotes: [widget],
  }
  async function inventory() {
    for (const [table, rows] of Object.entries(tables)) {
      await mkdir(join(directory, table), { recursive: true })
      await writeFile(
        join(directory, table, 'documents.jsonl'),
        rows.map((row) => JSON.stringify(row)).join('\n')
      )
    }
    const path = join(directory, `${crypto.randomUUID()}.zip`)
    execFileSync('zip', ['-qr', path, ...Object.keys(tables)], {
      cwd: directory,
    })
    return archiveInventory(path)
  }
  try {
    const before = await inventory()
    expect(before.widgetRelations).toMatchObject({
      valid: true,
      customDefinitions: 1,
      customInstances: 1,
      kinds: ['custom'],
    })
    compareInventories(before, await inventory())
    for (const patch of [{ ownerId: 'foreign' }, { projectId: 'foreign' }]) {
      tables.gmNotes = [{ ...widget, ...patch }]
      await expect(inventory()).rejects.toThrow('custom widget relations')
    }
    tables.gmNotes = [widget]
    tables.gmCustomWidgets = [{ ...definition, html: 'x'.repeat(65_537) }]
    await expect(inventory()).rejects.toThrow('custom widget relations')
    tables.gmCustomWidgets = []
    tables.gmNotes = [{ ...widget, deletedAt: 1 }]
    expect((await inventory()).widgetRelations.valid).toBe(true)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
