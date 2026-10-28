import { v } from 'convex/values'

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
const noteV1 = {
  ...noteCommon,
  body: v.string(),
  formatVersion: v.optional(v.literal(1)),
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
  v.literal('sheet')
)
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
export const widgetUpdateValidator = v.union(
  v.object({
    kind: noteV2.kind,
    config: noteV2.config,
    state: noteV2.state,
    body: v.string(),
  }),
  v.object({ ...checklistShape }),
  v.object({ ...counterShape }),
  v.object({ ...diceShape }),
  v.object(sheetShape)
)
const v2Common = { ...noteCommon, formatVersion: v.literal(2) }
export const noteFields = v.union(
  v.object(noteV1),
  v.object(noteV2),
  v.object({ ...v2Common, ...checklistShape }),
  v.object({ ...v2Common, ...counterShape }),
  v.object({ ...v2Common, ...diceShape }),
  v.object({ ...v2Common, ...sheetShape })
)
const noteSystem = { _id: v.id('gmNotes'), _creationTime: v.number() }
export const widgetValidator = v.union(
  v.object({ ...noteSystem, ...noteV2 }),
  v.object({ ...noteSystem, ...v2Common, ...checklistShape }),
  v.object({ ...noteSystem, ...v2Common, ...counterShape }),
  v.object({ ...noteSystem, ...v2Common, ...diceShape }),
  v.object({ ...noteSystem, ...v2Common, ...sheetShape })
)
const noteValidator = v.union(
  v.object({ ...noteSystem, ...noteV1 }),
  widgetValidator
)
export const trashWidgetValidator = v.union(
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
  v.object({ ...noteSystem, ...v2Common, ...sheetShape, preview: v.string() })
)
export const widgetContentFields = {
  ...owned,
  projectId: v.id('gmProjects'),
  screenId: v.id('gmScreens'),
  widgetId: v.id('gmNotes'),
  body: v.string(),
  formatVersion: v.literal(2),
}
const widgetContentValidator = v.object({
  _id: v.id('gmWidgetContents'),
  _creationTime: v.number(),
  ...widgetContentFields,
})
const legacyPlacementValidator = v.object({
  noteId: v.id('gmNotes'),
  ...geometryFields,
})
const placementValidator = v.object({
  widgetId: v.id('gmNotes'),
  ...geometryFields,
})
export const digitalLayoutFields = {
  name: v.string(),
  width: v.number(),
  height: v.number(),
  placements: v.array(v.union(legacyPlacementValidator, placementValidator)),
}
const digitalV2 = {
  ...digitalLayoutFields,
  placements: v.array(placementValidator),
}
const noteSnapshot = { kind: v.literal('note'), body: v.string() }
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
const digitalV1 = {
  ...digitalLayoutFields,
  placements: v.array(legacyPlacementValidator),
}
const historyV1 = {
  ...historyCommon,
  formatVersion: v.optional(v.literal(1)),
  snapshot: v.union(
    v.object(noteSnapshot),
    v.object({ kind: v.literal('layout'), ...digitalV1 })
  ),
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
    v.object({ kind: v.literal('layout'), ...digitalV2 })
  ),
}
export const historyFields = v.union(v.object(historyV1), v.object(historyV2))
const historySystem = {
  _id: v.id('gmEditorHistory'),
  _creationTime: v.number(),
}
export const historyValidator = v.union(
  v.object({ ...historySystem, ...historyV1 }),
  v.object({ ...historySystem, ...historyV2 })
)
const layoutCommon = {
  ...owned,
  projectId: v.id('gmProjects'),
  screenId: v.id('gmScreens'),
  kind: v.union(v.literal('digital'), v.literal('print')),
  unit: v.union(v.literal('px'), v.literal('mm')),
  version: v.number(),
}
const layoutV1 = {
  ...layoutCommon,
  ...digitalV1,
  formatVersion: v.optional(v.literal(1)),
}
const layoutV2 = { ...layoutCommon, ...digitalV2, formatVersion: v.literal(2) }
export const layoutFields = v.union(v.object(layoutV1), v.object(layoutV2))
const layoutSystem = { _id: v.id('gmLayouts'), _creationTime: v.number() }
export const normalizedLayoutValidator = v.object({
  ...layoutSystem,
  ...layoutV2,
})
const layoutValidator = v.union(
  v.object({ ...layoutSystem, ...layoutV1 }),
  v.object({ ...layoutSystem, ...layoutV2 })
)
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
export const gmCollection = v.union(
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
  v.literal('gmVariables')
)
export const gmDocument = v.union(
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
  variableValidator
)
