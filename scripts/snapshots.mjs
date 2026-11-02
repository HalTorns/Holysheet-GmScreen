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
  // Load application validation only after the caller has admitted its target.
  const { gmWidget } = await import('../shared/gm.ts')
  const { customDefinition } =
    await import('../shared/custom-widget-protocol.ts')
  const { detectFileMime } = await import('../shared/files.ts')
  const names = (await command('unzip', ['-Z1', path]))
    .split('\n')
    .filter((name) => name && !name.endsWith('/'))
  const tables = {}
  const files = {}
  const widgets = {}
  const blobTypes = {}
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
          'gmCustomWidgets',
          'gmFiles',
          'gmFileUsage',
          'gmProjects',
          '_storage',
          'gmNotes',
          'gmWidgetContents',
          'gmLayouts',
          'gmEditorHistory',
          'gmVariables',
          'gmSheets',
          'gmItemProfiles',
          'gmMerchantStock',
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
      blobTypes[name] = detectFileMime(new Uint8Array(payload))
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
        content.formatVersion === 2 &&
        parent?.formatVersion === 2 &&
        parent.kind === 'note' &&
        parent.ownerId === content.ownerId &&
        parent.projectId === content.projectId &&
        parent.screenId === content.screenId
      )
    }) &&
    notes.every(
      (note) =>
        note.formatVersion === 2 &&
        (note.kind === 'note'
          ? contentByWidget.has(note._id)
          : [
              'checklist',
              'counter',
              'dice',
              'sheet',
              'table',
              'clock',
              'initiative',
              'image',
              'pdf',
              'embed',
              'custom',
            ].includes(note.kind) &&
            gmWidget.safeParse({
              kind: note.kind,
              config: note.config,
              state: note.state,
            }).success &&
            !contentByWidget.has(note._id))
    ) &&
    (widgets.gmLayouts ?? []).every(
      (layout) =>
        layout.formatVersion === 2 &&
        layout.placements.every((placement) => {
          const parent = noteById.get(placement.widgetId)
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
      revision.formatVersion === 2 &&
      subject &&
      (![
        'table',
        'clock',
        'initiative',
        'image',
        'pdf',
        'embed',
        'custom',
      ].includes(revision.snapshot.kind) ||
        gmWidget.safeParse(revision.snapshot).success) &&
      (revision.snapshot.kind === 'layout' ||
        revision.snapshot.kind === subject.kind) &&
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
  // Un widget fiche référence une fiche du même compte et du même projet ;
  // une fiche absente reste admise (affichée « indisponible »).
  const sheetsById = new Map(
    (widgets.gmSheets ?? []).map((sheet) => [sheet._id, sheet])
  )
  const validSheets = notes
    .filter((note) => note.kind === 'sheet' && note.config.sheetId)
    .every((note) => {
      const sheet = sheetsById.get(note.config.sheetId)
      return (
        !sheet ||
        (sheet.ownerId === note.ownerId && sheet.projectId === note.projectId)
      )
    })
  const projectById = new Map(
    (widgets.gmProjects ?? []).map((project) => [project._id, project])
  )
  const profiles = widgets.gmItemProfiles ?? []
  const stocks = widgets.gmMerchantStock ?? []
  const profileSheets = new Set()
  const stockPairs = new Set()
  const sellersPerItem = new Map()
  const validCatalogSheet = (id, row, kind) => {
    const sheet = sheetsById.get(id)
    return (
      sheet &&
      sheet.kind === kind &&
      sheet.ownerId === row.ownerId &&
      sheet.projectId === row.projectId &&
      projectById.get(row.projectId)?.ownerId === row.ownerId
    )
  }
  const validProfiles = profiles.every((profile) => {
    const duplicate = profileSheets.has(profile.sheetId)
    profileSheets.add(profile.sheetId)
    return !duplicate && validCatalogSheet(profile.sheetId, profile, 'item')
  })
  const validStock = stocks.every((row) => {
    const pair = `${row.merchantId}:${row.itemId}`
    const duplicate = stockPairs.has(pair)
    stockPairs.add(pair)
    sellersPerItem.set(row.itemId, (sellersPerItem.get(row.itemId) ?? 0) + 1)
    return (
      !duplicate &&
      validCatalogSheet(row.merchantId, row, 'merchant') &&
      validCatalogSheet(row.itemId, row, 'item')
    )
  })
  if (!validProfiles || !validStock)
    throw new Error(
      'Snapshot catalogue or merchant stock relations are invalid.'
    )
  const fileById = new Map(
    (widgets.gmFiles ?? []).map((file) => [file._id, file])
  )
  const storageById = new Map(
    (widgets._storage ?? []).map((blob) => [blob._id, blob])
  )
  const storageIds = new Set()
  const bytesByOwner = new Map()
  const validFiles = (widgets.gmFiles ?? []).every((file) => {
    const project = projectById.get(file.projectId)
    const storage = storageById.get(file.storageId)
    const name = Object.keys(files).find(
      (name) => name.split('/').at(-1)?.split('.')[0] === file.storageId
    )
    const duplicate = storageIds.has(file.storageId)
    storageIds.add(file.storageId)
    bytesByOwner.set(
      file.ownerId,
      (bytesByOwner.get(file.ownerId) ?? 0) + file.size
    )
    return (
      !duplicate &&
      project?.ownerId === file.ownerId &&
      storage &&
      name &&
      files[name].bytes === file.size &&
      storage.size === file.size &&
      storage.contentType === file.mimeType &&
      blobTypes[name] === file.mimeType
    )
  })
  const validFileWidgets = notes
    .filter((note) => ['image', 'pdf'].includes(note.kind))
    .every((note) => {
      const file = fileById.get(note.config.fileId)
      // Purged or unselected references deliberately render as unavailable.
      return (
        !file ||
        (file.ownerId === note.ownerId &&
          file.projectId === note.projectId &&
          (note.kind === 'pdf') === (file.mimeType === 'application/pdf'))
      )
    })
  const usageByOwner = new Map(
    (widgets.gmFileUsage ?? []).map((usage) => [usage.ownerId, usage.bytes])
  )
  const validUsage =
    usageByOwner.size === (widgets.gmFileUsage ?? []).length &&
    [...bytesByOwner].every(
      ([ownerId, bytes]) => usageByOwner.get(ownerId) === bytes
    ) &&
    [...usageByOwner].every(
      ([ownerId, bytes]) => (bytesByOwner.get(ownerId) ?? 0) === bytes
    )
  if (!validFiles || !validFileWidgets || !validUsage)
    throw new Error(
      'Snapshot file relations, MIME, storage bytes or quota counters are invalid.'
    )
  const customById = new Map(
    (widgets.gmCustomWidgets ?? []).map((definition) => [
      definition._id,
      definition,
    ])
  )
  const validCustom =
    (widgets.gmCustomWidgets ?? []).every((definition) => {
      const project = (widgets.gmProjects ?? []).find(
        (entry) => entry._id === definition.projectId
      )
      const {
        ownerId: _owner,
        projectId: _project,
        _id: _definitionId,
        _creationTime: _created,
        version: _version,
        deletedAt: _deleted,
        ...input
      } = definition
      return (
        project?.ownerId === definition.ownerId &&
        customDefinition.safeParse(input).success
      )
    }) &&
    notes
      .filter((note) => note.kind === 'custom')
      .every((note) => {
        if (!note.config.definitionId) return true
        const definition = customById.get(note.config.definitionId)
        // Purged definitions are deliberately allowed; retained references must share scope.
        return (
          !definition ||
          (definition.ownerId === note.ownerId &&
            definition.projectId === note.projectId)
        )
      })
  if (!validCustom)
    throw new Error('Snapshot custom widget relations are invalid.')
  const widgetRelations = {
    valid:
      valid &&
      validHistory &&
      validLinks &&
      validSheets &&
      validProfiles &&
      validStock &&
      validFiles &&
      validFileWidgets &&
      validUsage &&
      validCustom,
    customDefinitions: customById.size,
    customInstances: notes.filter((note) => note.kind === 'custom').length,
    itemProfiles: profiles.length,
    stockLines: stocks.length,
    sharedStockItems: [...sellersPerItem.values()].filter((count) => count >= 2)
      .length,
    fileCount: fileById.size,
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
    richNotes: contents.filter(
      (content) => content.bodyFormat === 'markdown-v1'
    ).length,
    plainNoteRevisions: (widgets.gmEditorHistory ?? []).filter(
      (revision) =>
        revision.snapshot.kind === 'note' &&
        (revision.snapshot.bodyFormat ?? 'plain') === 'plain'
    ).length,
    nonEmptyNotes: notes.filter(
      (note) =>
        (note.body ?? contentByWidget.get(note._id)?.body ?? '').length > 0
    ).length,
    trashed: notes.filter((note) => note.deletedAt !== undefined).length,
    revisions: (widgets.gmEditorHistory ?? []).length,
  }
  if (!widgetRelations.valid)
    throw new Error('Snapshot widget relations are invalid.')
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
