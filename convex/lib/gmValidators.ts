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
export const noteFields = {
  ...owned,
  projectId: v.id('gmProjects'),
  screenId: v.id('gmScreens'),
  body: v.string(),
  version: v.number(),
  deletedAt: v.optional(v.number()),
  trashPlacements: v.optional(
    v.array(v.object({ layoutId: v.id('gmLayouts'), ...geometryFields }))
  ),
}
export const placementValidator = v.object({
  noteId: v.id('gmNotes'),
  ...geometryFields,
})
export const digitalLayoutFields = {
  name: v.string(),
  width: v.number(),
  height: v.number(),
  placements: v.array(placementValidator),
}
export const historySnapshot = v.union(
  v.object({ kind: v.literal('note'), body: v.string() }),
  v.object({ kind: v.literal('layout'), ...digitalLayoutFields })
)
export const historyTarget = v.union(
  v.object({ kind: v.literal('note'), id: v.id('gmNotes') }),
  v.object({ kind: v.literal('layout'), id: v.id('gmLayouts') })
)
export const historyFields = {
  ...owned,
  projectId: v.id('gmProjects'),
  screenId: v.id('gmScreens'),
  subjectId: v.union(v.id('gmNotes'), v.id('gmLayouts')),
  version: v.number(),
  snapshot: historySnapshot,
}
export const historyValidator = v.object({
  _id: v.id('gmEditorHistory'),
  _creationTime: v.number(),
  ...historyFields,
})
export const layoutFields = {
  ...owned,
  projectId: v.id('gmProjects'),
  screenId: v.id('gmScreens'),
  name: v.string(),
  kind: v.union(v.literal('digital'), v.literal('print')),
  unit: v.union(v.literal('px'), v.literal('mm')),
  width: v.number(),
  height: v.number(),
  placements: v.array(placementValidator),
  version: v.number(),
}
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
export const noteValidator = v.object({
  _id: v.id('gmNotes'),
  _creationTime: v.number(),
  ...noteFields,
})
export const layoutValidator = v.object({
  _id: v.id('gmLayouts'),
  _creationTime: v.number(),
  ...layoutFields,
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
  layoutValidator,
  historyValidator,
  sheetValidator,
  sheetContentValidator,
  sheetLinkValidator,
  variableValidator
)
