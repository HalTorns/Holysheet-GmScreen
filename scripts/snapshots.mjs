import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'

const execute = promisify(execFile)
async function command(program, args, options = {}) {
  try {
    const result = await execute(program, args, {
      maxBuffer: 128 * 1024 * 1024,
      timeout: 180_000,
      ...options,
    })
    return result.stdout
  } catch {
    throw new Error('Snapshot inventory failed; private output omitted.')
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])])
    )
  }
  return value
}

export function checksum(value) {
  return createHash('sha256').update(value).digest('hex')
}

export async function archiveInventory(path) {
  const names = (await command('unzip', ['-Z1', path]))
    .split('\n')
    .filter((name) => name && !name.endsWith('/'))
  const tables = {}
  const files = {}
  const widgets = {}
  for (const name of names) {
    if (name.endsWith('/documents.jsonl')) {
      // Table-number metadata belongs to each backend. Application IDs and
      // creation times remain in the comparison and must survive the import.
      if (
        name.endsWith('/_tables/documents.jsonl') ||
        name === '_tables/documents.jsonl'
      )
        continue
      const payload = await command('unzip', ['-p', path, name])
      let documents
      try {
        documents = payload
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.stringify(canonicalJson(JSON.parse(line))))
          .sort()
      } catch {
        throw new Error('A snapshot contains invalid JSON documents.')
      }
      const tableName = name.slice(0, -'/documents.jsonl'.length)
      if (
        [
          'gmNotes',
          'gmWidgetContents',
          'gmLayouts',
          'gmEditorHistory',
          'gmVariables',
        ].includes(tableName)
      )
        widgets[tableName] = documents.map((document) => JSON.parse(document))
      tables[tableName] = {
        count: documents.length,
        checksum: checksum(documents.join('\n')),
      }
    } else if (name.includes('_storage/')) {
      const payload = await command('unzip', ['-p', path, name], {
        encoding: 'buffer',
      })
      files[name] = { bytes: payload.length, checksum: checksum(payload) }
    }
  }
  // Only aggregate evidence leaves this function; no bodies, IDs or auth data
  // enter the restore report. Canonical checksums above remain authoritative.
  const notes = widgets.gmNotes ?? []
  const contents = widgets.gmWidgetContents ?? []
  const layouts = widgets.gmLayouts ?? []
  const layoutById = new Map(layouts.map((layout) => [layout._id, layout]))
  const noteById = new Map(notes.map((note) => [note._id, note]))
  const contentByWidget = new Map(
    contents.map((content) => [content.widgetId, content])
  )
  const valid =
    contentByWidget.size === contents.length &&
    contents.every((content) => {
      const parent = noteById.get(content.widgetId)
      return (
        parent?.formatVersion === 2 &&
        parent.kind === 'note' &&
        parent.ownerId === content.ownerId &&
        parent.projectId === content.projectId &&
        parent.screenId === content.screenId
      )
    }) &&
    notes.every(
      (note) =>
        note.formatVersion !== 2 ||
        (note.kind === 'note'
          ? contentByWidget.has(note._id)
          : ['checklist', 'counter', 'dice'].includes(note.kind) &&
            !contentByWidget.has(note._id))
    ) &&
    (widgets.gmLayouts ?? []).every((layout) =>
      layout.placements.every((placement) => {
        const parent = noteById.get(placement.widgetId ?? placement.noteId)
        return (
          parent &&
          parent.deletedAt === undefined &&
          parent.screenId === layout.screenId &&
          parent.ownerId === layout.ownerId &&
          parent.projectId === layout.projectId
        )
      })
    )
  const validHistory = (widgets.gmEditorHistory ?? []).every((revision) => {
    const subject =
      revision.snapshot.kind === 'layout'
        ? layoutById.get(revision.subjectId)
        : noteById.get(revision.subjectId)
    return (
      subject &&
      (revision.snapshot.kind === 'layout' ||
        revision.snapshot.kind === (subject.kind ?? 'note')) &&
      subject.ownerId === revision.ownerId &&
      subject.projectId === revision.projectId &&
      subject.screenId === revision.screenId
    )
  })
  const variablesById = new Map(
    (widgets.gmVariables ?? []).map((variable) => [variable._id, variable])
  )
  const linkedCounters = notes.filter(
    (note) => note.kind === 'counter' && note.config.source.type === 'variable'
  )
  const validLinks = linkedCounters.every((note) => {
    const source = variablesById.get(note.config.source.variableId)
    return (
      !source ||
      (source.ownerId === note.ownerId && source.projectId === note.projectId)
    )
  })
  const widgetRelations = {
    valid: valid && validHistory && validLinks,
    linkedCounters: linkedCounters.length,
    availableCounters: linkedCounters.filter((note) => {
      const source = variablesById.get(note.config.source.variableId)
      return (
        source?.type === 'number' &&
        source.ownerId === note.ownerId &&
        source.projectId === note.projectId
      )
    }).length,
    checkedItems: notes
      .filter((note) => note.kind === 'checklist')
      .reduce((sum, note) => sum + note.state.checkedIds.length, 0),
    kinds: [...new Set(notes.map((note) => note.kind ?? 'note'))].sort((a, b) =>
      a.localeCompare(b)
    ),
    payloads: contents.length,
    nonEmptyNotes: notes.filter(
      (note) =>
        (note.body ?? contentByWidget.get(note._id)?.body ?? '').length > 0
    ).length,
    trashed: notes.filter((note) => note.deletedAt !== undefined).length,
    revisions: (widgets.gmEditorHistory ?? []).length,
  }
  return { tables, files, widgetRelations }
}

export function compareInventories(source, restored) {
  for (const name of new Set([
    ...Object.keys(source.tables),
    ...Object.keys(restored.tables),
  ])) {
    const before = source.tables[name] ?? { count: 0, checksum: checksum('') }
    const after = restored.tables[name] ?? { count: 0, checksum: checksum('') }
    if (before.count !== after.count || before.checksum !== after.checksum) {
      throw new Error(`Restored table payload differs: ${name}.`)
    }
  }
  if (
    JSON.stringify(canonicalJson(source.files)) !==
    JSON.stringify(canonicalJson(restored.files))
  ) {
    throw new Error('Restored file-storage payload differs.')
  }
}
