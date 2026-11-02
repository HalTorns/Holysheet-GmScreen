import { ConvexError } from 'convex/values'

import {
  detectFileMime,
  FILE_IMAGE_BYTES,
  FILE_PDF_BYTES,
} from '../shared/files'
import { internal } from './_generated/api'
import { httpAction } from './_generated/server'

function cors(request: Request) {
  const origin = process.env.SITE_URL
  if (!origin || request.headers.get('Origin') !== new URL(origin).origin)
    return null
  return {
    'Access-Control-Allow-Origin': new URL(origin).origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    Vary: 'Origin',
  }
}
export const uploadPreflight = httpAction((_ctx, request) => {
  const headers = cors(request)
  return Promise.resolve(
    new Response(null, { status: headers ? 204 : 403, headers: headers ?? {} })
  )
})
export const upload = httpAction(async (ctx, request) => {
  const headers = cors(request)
  if (!headers) return new Response(null, { status: 403 })
  const reply = (value: object, status = 200) =>
    Response.json(value, { status, headers })
  try {
    // Authenticated context is propagated by runQuery/runMutation; no identity argument.
    await ctx.runMutation(internal.gmFiles.admitUpload, {})
    const projectId = new URL(request.url).searchParams.get('projectId')
    // Convex validates the ID in the internal query, without unsafe assertions.
    if (!projectId) return reply({ code: 'INVALID_INPUT' }, 400)
    const args = { projectId }
    // The HTTP boundary receives strings; normalize in an authenticated internal query.
    const normalized = await ctx.runQuery(
      internal.gmFiles.authorizeUpload,
      args
    )
    const length = request.headers.get('Content-Length')
    if (!length || !/^\d+$/.test(length) || Number(length) > FILE_PDF_BYTES)
      return reply({ code: 'FILE_TOO_LARGE' }, 413)
    const reader = request.body?.getReader()
    if (!reader) return reply({ code: 'FILE_TYPE' }, 400)
    const chunks: Uint8Array<ArrayBuffer>[] = []
    let size = 0
    while (true) {
      const part = await reader.read()
      if (part.done) break
      size += part.value.byteLength
      if (size > FILE_PDF_BYTES) {
        await reader.cancel()
        return reply({ code: 'FILE_TOO_LARGE' }, 413)
      }
      chunks.push(new Uint8Array(part.value))
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    const mimeType = detectFileMime(bytes)
    if (!mimeType) return reply({ code: 'FILE_TYPE' }, 415)
    if (
      size >
      (mimeType === 'application/pdf' ? FILE_PDF_BYTES : FILE_IMAGE_BYTES)
    )
      return reply({ code: 'FILE_TOO_LARGE' }, 413)
    const storageId = await ctx.storage.store(
      new Blob([bytes], { type: mimeType })
    )
    try {
      const id = await ctx.runMutation(internal.gmFiles.registerUpload, {
        projectId: normalized,
        storageId,
        mimeType,
        size,
        name: new URL(request.url).searchParams.get('name') ?? 'Fichier',
      })
      return reply({ id, mimeType })
    } catch (error) {
      await ctx.storage.delete(storageId)
      throw error
    }
  } catch (error) {
    const data: unknown = error instanceof ConvexError ? error.data : null
    const code =
      data &&
      typeof data === 'object' &&
      'code' in data &&
      typeof data.code === 'string'
        ? data.code
        : 'UPLOAD_FAILED'
    return reply({ code }, code === 'UNAUTHENTICATED' ? 401 : 400)
  }
})
