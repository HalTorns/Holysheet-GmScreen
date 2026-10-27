import { z } from './zod'

export const gmTitle = z.string().trim().min(1).max(120)
export const gmNote = z.string().max(50_000)
export const GM_MAX_NOTES = 100
export const GM_MAX_LAYOUTS = 8
export const GM_MAX_FOLDER_DEPTH = 8
export const GM_HISTORY_LIMIT = 20
export const GM_MIN_WIDGET_WIDTH = 160
export const GM_MIN_WIDGET_HEIGHT = 120
export const GM_MAX_DIMENSION = 8192
export const gmLayoutSize = z.object({
  name: gmTitle,
  width: z.number().int().min(320).max(GM_MAX_DIMENSION),
  height: z.number().int().min(240).max(GM_MAX_DIMENSION),
})
export const gmTables = [
  'gmProjects',
  'gmFolders',
  'gmScreens',
  'gmNotes',
  'gmLayouts',
  'gmEditorHistory',
] as const
