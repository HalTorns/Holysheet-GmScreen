import { afterEach, expect, test, vi } from 'vitest'

import { api, components, internal } from '../../convex/_generated/api'
import {
  FILE_IMAGE_BYTES,
  FILE_PDF_BYTES,
  FILE_QUOTA_BYTES,
} from '../../shared/files'
import {
  createAuthenticatedUser,
  createBackendTest,
  confirmOperation,
} from './fixtures'

const origin = 'http://localhost:3000'
const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
const paginationOpts = { cursor: null, numItems: 20 }
afterEach(() => {
  vi.unstubAllEnvs()
  vi.useRealTimers()
})
async function setup() {
  vi.stubEnv('SITE_URL', origin)
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(
    backend,
    'files-alice@example.test'
  )
  const bob = await createAuthenticatedUser(backend, 'files-bob@example.test')
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'Fichiers',
  })
  const screenId = await alice.client.mutation(api.gm.createScreen, {
    projectId,
    title: 'Screen',
    format: 'digital',
  })
  const upload = (
    body: Uint8Array<ArrayBuffer> = png,
    declared = 'text/html',
    length = body.byteLength
  ) =>
    alice.client.fetch(
      `/files/upload?projectId=${projectId}&name=fixture.png`,
      {
        method: 'POST',
        headers: {
          Origin: origin,
          'Content-Type': declared,
          'Content-Length': String(length),
        },
        body,
      }
    )
  const blobs = () =>
    backend.run((ctx) => ctx.db.system.query('_storage').collect())
  const files = () =>
    alice.client.query(api.gmFiles.listFiles, {
      projectId,
      trash: false,
      paginationOpts,
    })
  return { backend, alice, bob, projectId, screenId, upload, blobs, files }
}

test('HTTP boundary refuses SVG, oversized declared/actual bodies and absent length without storing blobs', async () => {
  const { upload, blobs, alice, projectId } = await setup()
  for (const [bytes, length, code] of [
    [
      new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'),
      42,
      'FILE_TYPE',
    ],
    [png, FILE_PDF_BYTES + 1, 'FILE_TOO_LARGE'],
    [new Uint8Array(FILE_PDF_BYTES + 1), 8, 'FILE_TOO_LARGE'],
    [
      new Uint8Array([...png, ...new Uint8Array(FILE_IMAGE_BYTES)]),
      8,
      'FILE_TOO_LARGE',
    ],
  ] as const) {
    expect(
      await (await upload(bytes, 'image/png', length)).json()
    ).toMatchObject({ code })
    expect(await blobs()).toHaveLength(0)
  }
  const absent = await alice.client.fetch(
    `/files/upload?projectId=${projectId}`,
    { method: 'POST', headers: { Origin: origin }, body: png }
  )
  expect(await absent.json()).toMatchObject({ code: 'FILE_TOO_LARGE' })
  expect(await blobs()).toHaveLength(0)
})

test('stores canonical MIME including PDF declared as image and GIF+HTML; CORS is restricted', async () => {
  const { upload, blobs, files, backend } = await setup()
  for (const [bytes, mimeType] of [
    [png, 'image/png'],
    [new TextEncoder().encode('%PDF-1.4\nfixture'), 'application/pdf'],
    [
      new TextEncoder().encode('GIF89a<html><script>alert(1)</script>'),
      'image/gif',
    ],
    [new Uint8Array([255, 216, 255]), 'image/jpeg'],
    [new TextEncoder().encode('RIFF0000WEBP'), 'image/webp'],
  ] as const) {
    const response = await upload(bytes, 'image/png')
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({ mimeType })
    const stored = (await blobs()).at(-1)
    if (!stored) throw new Error('Missing blob')
    expect(
      await backend.run(
        async (ctx) => (await ctx.storage.get(stored._id))?.type
      )
    ).toBe(mimeType)
  }
  expect((await files()).page).toHaveLength(5)
  expect(
    (
      await backend.fetch('/files/upload', {
        method: 'OPTIONS',
        headers: { Origin: origin },
      })
    ).headers.get('Access-Control-Allow-Origin')
  ).toBe(origin)
  for (const method of ['OPTIONS', 'POST'])
    expect(
      (
        await backend.fetch('/files/upload', {
          method,
          headers: { Origin: 'https://foreign.test' },
        })
      ).status
    ).toBe(403)
})

test('requires live session and MFA before reading, and rechecks revocation at registration', async () => {
  const { backend, alice, bob, projectId, upload, blobs } = await setup()
  const foreign = await bob.client.fetch(
    `/files/upload?projectId=${projectId}`,
    {
      method: 'POST',
      headers: { Origin: origin, 'Content-Length': '8' },
      body: png,
    }
  )
  expect(await foreign.json()).toMatchObject({ code: 'NOT_FOUND' })
  await alice.client.query(internal.gmFiles.authorizeUpload, { projectId })
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: alice.userId }],
      update: { twoFactorEnabled: true },
    },
  })
  expect(await (await upload()).json()).toMatchObject({ code: 'MFA_REQUIRED' })
  await backend.mutation(components.betterAuth.adapter.updateOne, {
    input: {
      model: 'user',
      where: [{ field: '_id', value: alice.userId }],
      update: { twoFactorEnabled: false },
    },
  })
  await backend.mutation(components.betterAuth.adapter.deleteOne, {
    input: {
      model: 'session',
      where: [{ field: '_id', value: alice.sessionId }],
    },
  })
  expect(await (await upload()).json()).toMatchObject({
    code: 'UNAUTHENTICATED',
  })
  const storageId = await backend.run((ctx) =>
    ctx.storage.store(new Blob([png], { type: 'image/png' }))
  )
  await expect(
    alice.client.mutation(internal.gmFiles.registerUpload, {
      projectId,
      storageId,
      size: 8,
      mimeType: 'image/png',
      name: 'revoked',
    })
  ).rejects.toThrow('UNAUTHENTICATED')
  await backend.run((ctx) => ctx.storage.delete(storageId))
  expect(await blobs()).toHaveLength(0)
})

test('quota and project count are atomic; rejected final insertion removes its blob', async () => {
  const { backend, alice, upload, blobs, files } = await setup()
  await backend.run((ctx) =>
    ctx.db.insert('gmFileUsage', {
      ownerId: alice.userId,
      bytes: FILE_QUOTA_BYTES - png.length,
    })
  )
  const results = await Promise.all([upload(), upload()])
  expect(results.filter((response) => response.ok)).toHaveLength(1)
  const refused = results.find((response) => !response.ok)
  expect(await refused?.json()).toMatchObject({ code: 'STORAGE_QUOTA' })
  expect(await blobs()).toHaveLength(1)
  expect((await files()).page).toHaveLength(1)
  expect(await (await upload()).json()).toMatchObject({ code: 'STORAGE_QUOTA' })
  await backend.run(async (ctx) => {
    const counter = await ctx.db.query('gmFileUsage').first()
    if (counter) await ctx.db.patch('gmFileUsage', counter._id, { bytes: 8 })
    const file = await ctx.db.query('gmFiles').first()
    if (!file) throw new Error('Missing file')
    for (let index = 0; index < 199; index++) {
      const { _id, _creationTime, ...fields } = file
      await ctx.db.insert('gmFiles', fields)
    }
  })
  expect(await (await upload()).json()).toMatchObject({
    code: 'PROJECT_FILE_LIMIT',
  })
  expect(await blobs()).toHaveLength(1)
})

test('isolation, reference sharing, trash/restore/purge, export and real account cleanup entry points', async () => {
  vi.useFakeTimers()
  const { backend, alice, bob, projectId, screenId, upload, files, blobs } =
    await setup()
  expect((await upload()).ok).toBe(true)
  const file = (await files()).page[0]
  if (!file) throw new Error('Missing file')
  const widgetId = await alice.client.mutation(api.gmFiles.placeFile, {
    screenId,
    fileId: file._id,
  })
  expect(
    await alice.client.query(api.gmFiles.getWidgetFile, { widgetId })
  ).toMatchObject({ mimeType: 'image/png' })
  await expect(
    bob.client.query(api.gmFiles.getWidgetFile, { widgetId })
  ).rejects.toThrow('NOT_FOUND')
  await expect(
    bob.client.query(api.gmFiles.listFiles, {
      projectId,
      trash: false,
      paginationOpts,
    })
  ).rejects.toThrow('NOT_FOUND')
  for (const operation of [
    () =>
      bob.client.mutation(api.gmFiles.renameFile, {
        id: file._id,
        name: 'Intrus',
      }),
    () =>
      bob.client.mutation(api.gmFiles.setTrashed, {
        id: file._id,
        trash: true,
      }),
    () => bob.client.mutation(api.gmFiles.purgeFile, { id: file._id }),
    () =>
      bob.client.mutation(api.gmFiles.placeFile, {
        screenId,
        fileId: file._id,
      }),
  ])
    await expect(operation()).rejects.toThrow('NOT_FOUND')
  await expect(
    alice.client.mutation(api.gmFiles.purgeFile, { id: file._id })
  ).rejects.toThrow('INVALID_INPUT')
  const screen = await alice.client.query(api.gm.getScreen, { id: screenId })
  const layout = screen?.layouts[0]
  if (!layout) throw new Error('Missing layout')
  const copies = await alice.client.mutation(api.gmWidgets.changeNotes, {
    layoutId: layout._id,
    expectedVersion: layout.version,
    notes: [{ id: widgetId, version: 0 }],
    operation: 'duplicate',
  })
  const widgets = await alice.client.query(
    api.gmWidgets.getScreenWidgetMetadata,
    { screenId }
  )
  expect(
    widgets
      .filter((w) => w.kind === 'image')
      .every((w) => w.config.fileId === file._id)
  ).toBe(true)
  expect(copies).toHaveLength(1)
  expect(await blobs()).toHaveLength(1)
  await alice.client.mutation(api.gmFiles.setTrashed, {
    id: file._id,
    trash: true,
  })
  expect(
    await alice.client.query(api.gmFiles.getWidgetFile, { widgetId })
  ).toBeNull()
  await alice.client.mutation(api.gmFiles.setTrashed, {
    id: file._id,
    trash: false,
  })
  expect(
    await alice.client.query(api.gmFiles.getWidgetFile, { widgetId })
  ).not.toBeNull()
  const exported = await alice.client.query(api.gm.exportCollection, {
    collection: 'gmFiles',
    paginationOpts,
  })
  expect(exported.page).toEqual([file])
  await alice.client.mutation(api.gmFiles.setTrashed, {
    id: file._id,
    trash: true,
  })
  await alice.client.mutation(api.gmFiles.purgeFile, { id: file._id })
  expect(await blobs()).toHaveLength(0)
  expect(
    await alice.client.query(api.gmFiles.getWidgetFile, { widgetId })
  ).toBeNull()
  await upload()
  await confirmOperation(backend, alice, 'account.delete')
  await alice.client.mutation(api.account.deleteAccount, {
    confirmation: 'DELETE',
  })
  await backend.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await blobs()).toHaveLength(0)
  expect(
    await backend.run((ctx) => ctx.db.query('gmFiles').collect())
  ).toHaveLength(0)
})

test('orphan cron deletes only old unregistered blobs', async () => {
  vi.useFakeTimers()
  const { backend, upload, blobs } = await setup()
  await backend.run((ctx) => ctx.storage.store(new Blob([png])))
  await upload()
  vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000)
  const recent = await backend.run((ctx) => ctx.storage.store(new Blob([png])))
  await backend.mutation(internal.gmFiles.purgeOrphans, { cursor: null })
  const remaining = await blobs()
  expect(remaining).toHaveLength(2)
  expect(remaining.some((blob) => blob._id === recent)).toBe(true)
})

test.each(['image', 'pdf'] as const)(
  'validates, duplicates and restores %s widget state with a shared file',
  async (kind) => {
    const { alice, screenId, upload, files, blobs } = await setup()
    await upload(
      kind === 'pdf' ? new TextEncoder().encode('%PDF-1.4\nfixture') : png
    )
    const file = (await files()).page[0]
    if (!file) throw new Error('Missing file')
    const id = await alice.client.mutation(api.gmFiles.placeFile, {
      screenId,
      fileId: file._id,
    })
    const definition =
      kind === 'image'
        ? {
            kind,
            config: { fileId: file._id, alt: 'Carte', fit: 'cover' as const },
            state: { zoom: 2, x: 3, y: 4 },
          }
        : { kind, config: { fileId: file._id }, state: { page: 2 } }
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 0,
      widget: definition,
    })
    const badDefinition =
      kind === 'image'
        ? {
            ...definition,
            kind: 'image' as const,
            config: { fileId: file._id, alt: '', fit: 'contain' as const },
            state: { zoom: 0, x: 0, y: 0 },
          }
        : {
            kind: 'pdf' as const,
            config: { fileId: file._id },
            state: { page: 0 },
          }
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 1,
        widget: badDefinition,
      })
    ).rejects.toThrow('INVALID_INPUT')
    const history = await alice.client.query(api.gmEditor.listHistory, {
      target: { kind: 'note', id },
      paginationOpts,
    })
    const revision = history.page[0]
    if (!revision) throw new Error('Missing revision')
    await alice.client.mutation(api.gmEditor.restoreRevision, {
      id: revision._id,
      expectedVersion: 1,
    })
    let data = await alice.client.query(api.gm.getScreen, { id: screenId })
    let layout = data?.layouts[0]
    if (!layout) throw new Error('Missing layout')
    const copies = await alice.client.mutation(api.gmWidgets.changeNotes, {
      layoutId: layout._id,
      expectedVersion: layout.version,
      operation: 'duplicate',
      notes: [{ id, version: 2 }],
    })
    const copyId = copies[0]
    if (!copyId) throw new Error('Missing copy')
    expect(
      await alice.client.query(api.gmFiles.getWidgetFile, { widgetId: copyId })
    ).not.toBeNull()
    data = await alice.client.query(api.gm.getScreen, { id: screenId })
    layout = data?.layouts[0]
    if (!layout) throw new Error('Missing layout')
    await alice.client.mutation(api.gmWidgets.changeNotes, {
      layoutId: layout._id,
      expectedVersion: layout.version,
      operation: 'trash',
      notes: [{ id: copyId, version: 0 }],
    })
    await alice.client.mutation(api.gmWidgets.restoreNote, {
      id: copyId,
      expectedVersion: 1,
    })
    expect(await blobs()).toHaveLength(1)
    const widgets = await alice.client.query(
      api.gmWidgets.getScreenWidgetMetadata,
      { screenId }
    )
    expect(
      widgets
        .filter((w) => w.kind === kind)
        .every((w) => 'fileId' in w.config && w.config.fileId === file._id)
    ).toBe(true)
  }
)

test('account cleanup preserves file parents and quota between batches, then removes every blob', async () => {
  vi.useFakeTimers()
  const { backend, alice, projectId, blobs } = await setup()
  await backend.run(async (ctx) => {
    for (let index = 0; index < 21; index++) {
      const storageId = await ctx.storage.store(
        new Blob([png], { type: 'image/png' })
      )
      await ctx.db.insert('gmFiles', {
        ownerId: alice.userId,
        projectId,
        storageId,
        name: 'cleanup.png',
        mimeType: 'image/png',
        size: png.length,
        createdAt: Date.now(),
      })
    }
    await ctx.db.insert('gmFileUsage', {
      ownerId: alice.userId,
      bytes: 21 * png.length,
    })
  })
  await confirmOperation(backend, alice, 'account.delete')
  await alice.client.mutation(api.account.deleteAccount, {
    confirmation: 'DELETE',
  })
  const job = await backend.run((ctx) => ctx.db.query('cleanupJobs').first())
  if (!job) throw new Error('Missing cleanup job')
  await backend.mutation(internal.cleanup.processCleanup, { jobId: job._id })
  expect(
    await backend.run((ctx) => ctx.db.get('gmProjects', projectId))
  ).not.toBeNull()
  expect(
    await backend.run((ctx) => ctx.db.query('gmFiles').collect())
  ).toHaveLength(1)
  expect(
    await backend.run((ctx) => ctx.db.query('gmFileUsage').first())
  ).toMatchObject({ bytes: png.length })
  await backend.finishAllScheduledFunctions(vi.runAllTimers)
  expect(await blobs()).toHaveLength(0)
  expect(
    await backend.run((ctx) => ctx.db.query('gmFileUsage').collect())
  ).toHaveLength(0)
})

test('HTTP action never reads an anonymous body and removes the blob if the session is revoked during streaming', async () => {
  const { backend, alice, projectId, blobs } = await setup()
  let reads = 0
  const anonymousBody = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        reads += 1
        controller.enqueue(png)
        controller.close()
      },
    },
    { highWaterMark: 0 }
  )
  const headers = { Origin: origin, 'Content-Length': String(png.length) }
  const streamedRequest = (body: ReadableStream<Uint8Array>) => ({
    method: 'POST',
    headers,
    body,
    duplex: 'half',
  })
  const denied = await backend.fetch(
    `/files/upload?projectId=${projectId}`,
    streamedRequest(anonymousBody)
  )
  expect(await denied.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  expect(reads).toBe(0)
  const revokedBody = new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        await backend.mutation(components.betterAuth.adapter.deleteOne, {
          input: {
            model: 'session',
            where: [{ field: '_id', value: alice.sessionId }],
          },
        })
        controller.enqueue(png)
        controller.close()
      },
    },
    { highWaterMark: 0 }
  )
  const revoked = await alice.client.fetch(
    `/files/upload?projectId=${projectId}`,
    streamedRequest(revokedBody)
  )
  expect(await revoked.json()).toMatchObject({ code: 'UNAUTHENTICATED' })
  expect(await blobs()).toHaveLength(0)
})
