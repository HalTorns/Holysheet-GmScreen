import { v } from 'convex/values'

export const bodyFormatValidator = v.union(
  v.literal('plain'),
  v.literal('markdown-v1')
)

const owned = { ownerId: v.string(), updatedAt: v.number() }
export const projectFields = {
  ...owned,
  title: v.string(),
  archived: v.boolean(),
}
export const folderFields = {
  ...owned,
  projectId: v.id('gmProjects'),
  parentId: v.optional(v.id('gmFolders')),
  title: v.string(),
  depth: v.number(),
}
export const screenFields = {
  ...owned,
  projectId: v.id('gmProjects'),
  folderId: v.optional(v.id('gmFolders')),
  title: v.string(),
  layoutLocked: v.optional(v.boolean()),
}
export const widgetStyleValidator = v.object({
  background: v.string(),
  color: v.string(),
  borderColor: v.string(),
  fontFamily: v.union(v.literal('sans'), v.literal('serif'), v.literal('mono')),
  fontSize: v.number(),
  borderWidth: v.number(),
  radius: v.number(),
  opacity: v.number(),
})
const geometryFields = {
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  layer: v.number(),
  groupId: v.optional(v.string()),
  style: v.optional(widgetStyleValidator),
}
const noteCommon = {
  ...owned,
  projectId: v.id('gmProjects'),
  screenId: v.id('gmScreens'),
  version: v.number(),
  deletedAt: v.optional(v.number()),
  trashPlacements: v.optional(
    v.array(v.object({ layoutId: v.id('gmLayouts'), ...geometryFields }))
  ),
}
const noteV2 = {
  ...noteCommon,
  formatVersion: v.literal(2),
  kind: v.literal('note'),
  config: v.object({}),
  state: v.object({}),
}
export const widgetKindValidator = v.union(
  v.literal('note'),
  v.literal('checklist'),
  v.literal('counter'),
  v.literal('dice'),
  v.literal('sheet'),
  v.literal('table'),
  v.literal('clock'),
  v.literal('initiative'),
  v.literal('image'),
  v.literal('embed'),
  v.literal('pdf')
)
export const embedShape = {
  kind: v.literal('embed'),
  config: v.object({
    url: v.string(),
    title: v.string(),
    mode: v.union(v.literal('link'), v.literal('frame')),
  }),
  state: v.object({}),
}
const imageShape = {
  kind: v.literal('image'),
  config: v.object({
    fileId: v.optional(v.id('gmFiles')),
    alt: v.string(),
    fit: v.union(v.literal('contain'), v.literal('cover')),
  }),
  state: v.object({ zoom: v.number(), x: v.number(), y: v.number() }),
}
const pdfShape = {
  kind: v.literal('pdf'),
  config: v.object({ fileId: v.optional(v.id('gmFiles')) }),
  state: v.object({ page: v.number() }),
}
const checklistShape = {
  kind: v.literal('checklist'),
  config: v.object({
    title: v.string(),
    items: v.array(v.object({ id: v.string(), label: v.string() })),
  }),
  state: v.object({ checkedIds: v.array(v.string()) }),
}
const counterShape = {
  kind: v.literal('counter'),
  config: v.object({
    title: v.string(),
    source: v.union(
      v.object({
        type: v.literal('local'),
        step: v.number(),
        min: v.optional(v.number()),
        max: v.optional(v.number()),
      }),
      v.object({
        type: v.literal('variable'),
        variableId: v.id('gmVariables'),
        step: v.number(),
      })
    ),
  }),
  state: v.union(v.object({ value: v.number() }), v.object({})),
}
const sheetShape = {
  kind: v.literal('sheet'),
  config: v.object({
    title: v.string(),
    sheetId: v.optional(v.id('gmSheets')),
    display: v.union(
      v.literal('summary'),
      v.literal('fields'),
      v.literal('full')
    ),
    fieldLabels: v.array(v.string()),
  }),
  state: v.object({}),
}
const diceShape = {
  kind: v.literal('dice'),
  config: v.object({ title: v.string(), expression: v.string() }),
  state: v.object({}),
}
const tableShape = {
  kind: v.literal('table'),
  config: v.object({
    title: v.string(),
    columns: v.array(v.object({ id: v.string(), label: v.string() })),
  }),
  state: v.object({
    rows: v.array(v.object({ id: v.string(), cells: v.array(v.string()) })),
  }),
}
const clockShape = {
  kind: v.literal('clock'),
  config: v.union(
    v.object({ title: v.string(), mode: v.literal('stopwatch') }),
    v.object({
      title: v.string(),
      mode: v.literal('timer'),
      durationMs: v.number(),
    }),
    v.object({
      title: v.string(),
      mode: v.literal('segments'),
      segments: v.number(),
    })
  ),
  state: v.union(
    v.object({
      running: v.boolean(),
      startedAt: v.optional(v.number()),
      elapsedMs: v.number(),
    }),
    v.object({ filled: v.number() })
  ),
}
const initiativeShape = {
  kind: v.literal('initiative'),
  config: v.object({ title: v.string() }),
  state: v.object({
    entries: v.array(
      v.object({
        id: v.string(),
        name: v.string(),
        score: v.number(),
        note: v.string(),
      })
    ),
    currentId: v.optional(v.string()),
    round: v.number(),
  }),
}
export const widgetUpdateValidator = v.union(
  v.object({
    kind: noteV2.kind,
    config: noteV2.config,
    state: noteV2.state,
    body: v.string(),
    bodyFormat: v.optional(bodyFormatValidator),
  }),
  v.object({ ...checklistShape }),
  v.object({ ...counterShape }),
  v.object({ ...diceShape }),
  v.object(sheetShape),
  v.object(tableShape),
  v.object(clockShape),
  v.object(embedShape),
  v.object(imageShape),
  v.object(pdfShape),
  v.object(initiativeShape)
)
const v2Common = { ...noteCommon, formatVersion: v.literal(2) }
export const noteFields = v.union(
  v.object(noteV2),
  v.object({ ...v2Common, ...checklistShape }),
  v.object({ ...v2Common, ...counterShape }),
  v.object({ ...v2Common, ...diceShape }),
  v.object({ ...v2Common, ...sheetShape }),
  v.object({ ...v2Common, ...tableShape }),
  v.object({ ...v2Common, ...clockShape }),
  v.object({ ...v2Common, ...embedShape }),
  v.object({ ...v2Common, ...imageShape }),
  v.object({ ...v2Common, ...pdfShape }),
  v.object({ ...v2Common, ...initiativeShape })
)
const noteSystem = { _id: v.id('gmNotes'), _creationTime: v.number() }
export const widgetValidator = v.union(
  v.object({ ...noteSystem, ...noteV2 }),
  v.object({ ...noteSystem, ...v2Common, ...checklistShape }),
  v.object({ ...noteSystem, ...v2Common, ...counterShape }),
  v.object({ ...noteSystem, ...v2Common, ...diceShape }),
  v.object({ ...noteSystem, ...v2Common, ...sheetShape }),
  v.object({ ...noteSystem, ...v2Common, ...tableShape }),
  v.object({ ...noteSystem, ...v2Common, ...clockShape }),
  v.object({ ...noteSystem, ...v2Common, ...embedShape }),
  v.object({ ...noteSystem, ...v2Common, ...imageShape }),
  v.object({ ...noteSystem, ...v2Common, ...pdfShape }),
  v.object({ ...noteSystem, ...v2Common, ...initiativeShape })
)
const noteValidator = widgetValidator
export const trashWidgetValidator = v.union(
  v.object({ ...noteSystem, ...v2Common, ...embedShape, preview: v.string() }),
  v.object({ ...noteSystem, ...v2Common, ...imageShape, preview: v.string() }),
  v.object({ ...noteSystem, ...v2Common, ...pdfShape, preview: v.string() }),
  v.object({ ...noteSystem, ...noteV2, preview: v.string() }),
  v.object({
    ...noteSystem,
    ...v2Common,
    ...checklistShape,
    preview: v.string(),
  }),
  v.object({
    ...noteSystem,
    ...v2Common,
    ...counterShape,
    preview: v.string(),
  }),
  v.object({ ...noteSystem, ...v2Common, ...diceShape, preview: v.string() }),
  v.object({ ...noteSystem, ...v2Common, ...sheetShape, preview: v.string() }),
  v.object({ ...noteSystem, ...v2Common, ...tableShape, preview: v.string() }),
  v.object({ ...noteSystem, ...v2Common, ...clockShape, preview: v.string() }),
  v.object({
    ...noteSystem,
    ...v2Common,
    ...initiativeShape,
    preview: v.string(),
  })
)
export const widgetContentFields = {
  ...owned,
  projectId: v.id('gmProjects'),
  screenId: v.id('gmScreens'),
  widgetId: v.id('gmNotes'),
  body: v.string(),
  bodyFormat: v.optional(bodyFormatValidator),
  formatVersion: v.literal(2),
}
const widgetContentValidator = v.object({
  _id: v.id('gmWidgetContents'),
  _creationTime: v.number(),
  ...widgetContentFields,
})
const placementValidator = v.object({
  widgetId: v.id('gmNotes'),
  ...geometryFields,
})
export const digitalLayoutFields = {
  name: v.string(),
  width: v.number(),
  height: v.number(),
  placements: v.array(placementValidator),
}
const digitalV2 = {
  ...digitalLayoutFields,
  placements: v.array(placementValidator),
}
const noteSnapshot = {
  kind: v.literal('note'),
  body: v.string(),
  bodyFormat: v.optional(bodyFormatValidator),
}
export const historyTarget = v.union(
  v.object({ kind: v.literal('note'), id: v.id('gmNotes') }),
  v.object({ kind: v.literal('layout'), id: v.id('gmLayouts') })
)
const historyCommon = {
  ...owned,
  projectId: v.id('gmProjects'),
  screenId: v.id('gmScreens'),
  subjectId: v.union(v.id('gmNotes'), v.id('gmLayouts')),
  version: v.number(),
}
const historyV2 = {
  ...historyCommon,
  formatVersion: v.literal(2),
  snapshot: v.union(
    v.object({ ...noteSnapshot, config: v.object({}), state: v.object({}) }),
    v.object(checklistShape),
    v.object(counterShape),
    v.object(diceShape),
    v.object(sheetShape),
    v.object(tableShape),
    v.object(clockShape),
    v.object(embedShape),
    v.object(imageShape),
    v.object(pdfShape),
    v.object(initiativeShape),
    v.object({ kind: v.literal('layout'), ...digitalV2 })
  ),
}
export const historyFields = v.object(historyV2)
const historySystem = {
  _id: v.id('gmEditorHistory'),
  _creationTime: v.number(),
}
export const historyValidator = v.object({ ...historySystem, ...historyV2 })
const layoutCommon = {
  ...owned,
  projectId: v.id('gmProjects'),
  screenId: v.id('gmScreens'),
  kind: v.union(v.literal('digital'), v.literal('print')),
  unit: v.union(v.literal('px'), v.literal('mm')),
  version: v.number(),
}
const layoutV2 = { ...layoutCommon, ...digitalV2, formatVersion: v.literal(2) }
export const layoutFields = v.object(layoutV2)
const layoutSystem = { _id: v.id('gmLayouts'), _creationTime: v.number() }
export const normalizedLayoutValidator = v.object({
  ...layoutSystem,
  ...layoutV2,
})
const layoutValidator = normalizedLayoutValidator
export const projectValidator = v.object({
  _id: v.id('gmProjects'),
  _creationTime: v.number(),
  ...projectFields,
})
export const folderValidator = v.object({
  _id: v.id('gmFolders'),
  _creationTime: v.number(),
  ...folderFields,
})
export const screenValidator = v.object({
  _id: v.id('gmScreens'),
  _creationTime: v.number(),
  ...screenFields,
})
export const sheetKindValidator = v.union(
  v.literal('npc'),
  v.literal('monster'),
  v.literal('merchant'),
  v.literal('item'),
  v.literal('place'),
  v.literal('rule'),
  v.literal('event'),
  v.literal('note'),
  v.literal('other')
)
export const sheetFieldValidator = v.object({
  label: v.string(),
  value: v.string(),
})
export const sheetFields = {
  ...owned,
  projectId: v.id('gmProjects'),
  kind: sheetKindValidator,
  title: v.string(),
  summary: v.string(),
  version: v.number(),
  deletedAt: v.optional(v.number()),
}
export const sheetContentFields = {
  ...owned,
  projectId: v.id('gmProjects'),
  sheetId: v.id('gmSheets'),
  body: v.string(),
  fields: v.array(sheetFieldValidator),
}
export const sheetLinkFields = {
  ...owned,
  projectId: v.id('gmProjects'),
  fromId: v.id('gmSheets'),
  toId: v.id('gmSheets'),
}
export const sheetValidator = v.object({
  _id: v.id('gmSheets'),
  _creationTime: v.number(),
  ...sheetFields,
})
export const sheetContentValidator = v.object({
  _id: v.id('gmSheetContents'),
  _creationTime: v.number(),
  ...sheetContentFields,
})
export const sheetLinkValidator = v.object({
  _id: v.id('gmSheetLinks'),
  _creationTime: v.number(),
  ...sheetLinkFields,
})
const variableCommon = {
  ...owned,
  projectId: v.id('gmProjects'),
  name: v.string(),
  nameKey: v.string(),
  label: v.string(),
  version: v.number(),
}
const variableShapes = {
  number: {
    type: v.literal('number'),
    value: v.number(),
    min: v.optional(v.number()),
    max: v.optional(v.number()),
  },
  text: { type: v.literal('text'), value: v.string() },
  boolean: { type: v.literal('boolean'), value: v.boolean() },
  formula: {
    type: v.literal('formula'),
    expression: v.string(),
    dependencies: v.array(v.string()),
  },
}
export const variableFields = v.union(
  v.object({ ...variableCommon, ...variableShapes.number }),
  v.object({ ...variableCommon, ...variableShapes.text }),
  v.object({ ...variableCommon, ...variableShapes.boolean }),
  v.object({ ...variableCommon, ...variableShapes.formula })
)
const variableSystem = {
  _id: v.id('gmVariables'),
  _creationTime: v.number(),
  ...variableCommon,
}
export const variableValidator = v.union(
  v.object({ ...variableSystem, ...variableShapes.number }),
  v.object({ ...variableSystem, ...variableShapes.text }),
  v.object({ ...variableSystem, ...variableShapes.boolean }),
  v.object({ ...variableSystem, ...variableShapes.formula })
)
export const variableDefinitionValidator = v.union(
  v.object(variableShapes.number),
  v.object(variableShapes.text),
  v.object(variableShapes.boolean),
  v.object({ type: v.literal('formula'), expression: v.string() })
)
export const fileMime = v.union(
  v.literal('image/png'),
  v.literal('image/jpeg'),
  v.literal('image/webp'),
  v.literal('image/gif'),
  v.literal('application/pdf')
)
export const fileFields = {
  ownerId: v.string(),
  projectId: v.id('gmProjects'),
  storageId: v.id('_storage'),
  name: v.string(),
  mimeType: fileMime,
  size: v.number(),
  createdAt: v.number(),
  deletedAt: v.optional(v.number()),
}
export const fileValidator = v.object({
  _id: v.id('gmFiles'),
  _creationTime: v.number(),
  ...fileFields,
})
export const fileUsageFields = { ownerId: v.string(), bytes: v.number() }
const fileUsageValidator = v.object({
  _id: v.id('gmFileUsage'),
  _creationTime: v.number(),
  ...fileUsageFields,
})
export const itemProfileFields = {
  ownerId: v.string(),
  projectId: v.id('gmProjects'),
  sheetId: v.id('gmSheets'),
  price: v.optional(v.number()),
  currency: v.string(),
  category: v.string(),
  version: v.number(),
}
export const stockFields = {
  ownerId: v.string(),
  projectId: v.id('gmProjects'),
  merchantId: v.id('gmSheets'),
  itemId: v.id('gmSheets'),
  quantity: v.union(v.number(), v.null()),
  price: v.optional(v.number()),
  available: v.boolean(),
  order: v.number(),
  version: v.number(),
}
export const itemProfileValidator = v.object({
  _id: v.id('gmItemProfiles'),
  _creationTime: v.number(),
  ...itemProfileFields,
})
export const stockValidator = v.object({
  _id: v.id('gmMerchantStock'),
  _creationTime: v.number(),
  ...stockFields,
})
export const gmCollection = v.union(
  v.literal('gmItemProfiles'),
  v.literal('gmMerchantStock'),
  v.literal('gmProjects'),
  v.literal('gmFolders'),
  v.literal('gmScreens'),
  v.literal('gmNotes'),
  v.literal('gmWidgetContents'),
  v.literal('gmLayouts'),
  v.literal('gmEditorHistory'),
  v.literal('gmSheets'),
  v.literal('gmSheetContents'),
  v.literal('gmSheetLinks'),
  v.literal('gmVariables'),
  v.literal('gmFiles'),
  v.literal('gmFileUsage')
)
export const gmDocument = v.union(
  itemProfileValidator,
  stockValidator,
  projectValidator,
  folderValidator,
  screenValidator,
  noteValidator,
  widgetContentValidator,
  layoutValidator,
  historyValidator,
  sheetValidator,
  sheetContentValidator,
  sheetLinkValidator,
  variableValidator,
  fileValidator,
  fileUsageValidator
)
