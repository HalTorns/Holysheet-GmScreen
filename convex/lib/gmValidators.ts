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
}
export const noteFields = {
  ...owned,
  projectId: v.id('gmProjects'),
  screenId: v.id('gmScreens'),
  body: v.string(),
  version: v.number(),
}
export const placementValidator = v.object({
  noteId: v.id('gmNotes'),
  x: v.number(),
  y: v.number(),
  width: v.number(),
  height: v.number(),
  layer: v.number(),
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
export const gmCollection = v.union(
  v.literal('gmProjects'),
  v.literal('gmFolders'),
  v.literal('gmScreens'),
  v.literal('gmNotes'),
  v.literal('gmLayouts')
)
export const gmDocument = v.union(
  projectValidator,
  folderValidator,
  screenValidator,
  noteValidator,
  layoutValidator
)
