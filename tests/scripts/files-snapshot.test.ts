// @vitest-environment node
import { execFileSync } from 'node:child_process'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from 'vitest'

import {
  archiveInventory,
  compareInventories,
} from '../../scripts/snapshots.mjs'

// Exercise the actual ZIP reader, including MIME bytes, rather than a parallel validator.
test('snapshot validates nonempty file relations, canonical blobs and quota and rejects corrupt archives', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'f6-snapshot-'))
  try {
    const png = await readFile(
      new URL('../fixtures/files/pixel.png', import.meta.url)
    )
    const pdf = await readFile(
      new URL('../fixtures/files/two-pages.pdf', import.meta.url)
    )
    const files = [
      {
        _id: 'file-image',
        ownerId: 'owner',
        projectId: 'project',
        storageId: 'blob-image',
        name: 'pixel.png',
        mimeType: 'image/png',
        size: png.length,
        createdAt: 1,
      },
      {
        _id: 'file-pdf',
        ownerId: 'owner',
        projectId: 'project',
        storageId: 'blob-pdf',
        name: 'pages.pdf',
        mimeType: 'application/pdf',
        size: pdf.length,
        createdAt: 1,
      },
    ]
    const widgets = [
      {
        _id: 'image',
        ownerId: 'owner',
        projectId: 'project',
        screenId: 'screen',
        formatVersion: 2,
        kind: 'image',
        config: { fileId: 'file-image', alt: '', fit: 'contain' },
        state: { zoom: 1, x: 0, y: 0 },
      },
      {
        _id: 'pdf',
        ownerId: 'owner',
        projectId: 'project',
        screenId: 'screen',
        formatVersion: 2,
        kind: 'pdf',
        config: { fileId: 'file-pdf' },
        state: { page: 2 },
      },
    ]
    const tables: Record<string, unknown[]> = {
      gmProjects: [{ _id: 'project', ownerId: 'owner' }],
      gmFiles: files,
      gmFileUsage: [
        { _id: 'usage', ownerId: 'owner', bytes: png.length + pdf.length },
      ],
      gmNotes: widgets,
      _storage: files.map((file) => ({
        _id: file.storageId,
        size: file.size,
        contentType: file.mimeType,
      })),
    }
    await mkdir(join(directory, '_storage'), { recursive: true })
    await writeFile(join(directory, '_storage/blob-image.png'), png)
    await writeFile(join(directory, '_storage/blob-pdf.pdf'), pdf)
    const archive = async (name: string) => {
      for (const [table, rows] of Object.entries(tables)) {
        await mkdir(join(directory, table), { recursive: true })
        await writeFile(
          join(directory, table, 'documents.jsonl'),
          rows.map((row) => JSON.stringify(row)).join('\n')
        )
      }
      const path = join(directory, `${name}.zip`)
      execFileSync('zip', ['-qr', path, ...Object.keys(tables)], {
        cwd: directory,
      })
      return path
    }
    const source = await archiveInventory(await archive('source'))
    expect(source.widgetRelations).toMatchObject({
      valid: true,
      fileCount: 2,
      kinds: ['image', 'pdf'],
    })
    compareInventories(
      source,
      await archiveInventory(await archive('restored'))
    )
    const image = files[0]
    if (!image) throw new Error('Missing fixture')
    image.ownerId = 'foreign'
    await expect(
      archiveInventory(await archive('wrong-owner'))
    ).rejects.toThrow('file relations')
    image.ownerId = 'owner'
    image.mimeType = 'text/html'
    await expect(archiveInventory(await archive('wrong-mime'))).rejects.toThrow(
      'file relations'
    )
    image.mimeType = 'image/png'
    tables.gmFileUsage = [{ _id: 'usage', ownerId: 'owner', bytes: 0 }]
    await expect(
      archiveInventory(await archive('wrong-quota'))
    ).rejects.toThrow('file relations')
    tables.gmFileUsage = [
      { _id: 'usage', ownerId: 'owner', bytes: png.length + pdf.length },
    ]
    await rm(join(directory, '_storage/blob-image.png'))
    await expect(
      archiveInventory(await archive('missing-blob'))
    ).rejects.toThrow('file relations')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
