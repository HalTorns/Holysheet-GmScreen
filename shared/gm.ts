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
  'gmSheets',
  'gmSheetContents',
  'gmSheetLinks',
] as const

// Bibliothèque de fiches (F1). Les métadonnées légères (gmSheets) sont
// séparées du contenu lourd (gmSheetContents) pour rester sous les limites
// de lecture Convex : voir docs/PLAN-F1.md.
export const GM_MAX_SHEETS = 500
export const GM_MAX_SHEET_LINKS = 50
export const GM_MAX_SHEET_FIELDS = 40
export const gmSheetKinds = [
  'npc',
  'monster',
  'merchant',
  'item',
  'place',
  'rule',
  'event',
  'note',
  'other',
] as const
export type GmSheetKind = (typeof gmSheetKinds)[number]
export const gmSheetKindLabels: Record<GmSheetKind, string> = {
  npc: 'PNJ',
  monster: 'Monstre',
  merchant: 'Marchand',
  item: 'Objet',
  place: 'Lieu',
  rule: 'Règle',
  event: 'Événement',
  note: 'Note',
  other: 'Autre',
}
export const gmSheetContent = z.object({
  title: gmTitle,
  summary: z.string().trim().max(500),
  body: gmNote,
  fields: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(60),
        value: z.string().max(2000),
      })
    )
    .max(GM_MAX_SHEET_FIELDS),
})
export function gmSheetKindOf(value: string): GmSheetKind | undefined {
  return gmSheetKinds.find((kind) => kind === value)
}
export const gmSheetSearch = z.string().trim().min(1).max(100)
