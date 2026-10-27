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
export const GM_MAX_TRASH = 100
export const gmWidgetStyle = z.object({
  background: z.string().regex(/^#[0-9a-f]{6}$/i),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  borderColor: z.string().regex(/^#[0-9a-f]{6}$/i),
  fontFamily: z.enum(['sans', 'serif', 'mono']),
  fontSize: z.number().int().min(10).max(48),
  borderWidth: z.number().int().min(0).max(8),
  radius: z.number().int().min(0).max(32),
  opacity: z.number().int().min(20).max(100),
})
export const defaultWidgetStyle = {
  background: '#ffffff',
  color: '#202a24',
  borderColor: '#d6d9d4',
  fontFamily: 'sans',
  fontSize: 14,
  borderWidth: 1,
  radius: 8,
  opacity: 100,
} as const
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
