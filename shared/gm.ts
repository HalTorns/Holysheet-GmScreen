import { parseDice } from './dice'
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
  'gmWidgetContents',
  'gmLayouts',
  'gmEditorHistory',
  'gmSheets',
  'gmSheetContents',
  'gmSheetLinks',
  'gmVariables',
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

// Variables de projet (F2).
export const GM_MAX_VARIABLES = 200
export const gmVariableName = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,39}$/)
export const gmVariableLabel = z.string().trim().max(120)
export const gmVariableText = z.string().max(2000)

export const gmWidgetKinds = ['note', 'checklist', 'counter', 'dice'] as const
export const gmWidgetLabels = {
  note: 'Note',
  checklist: 'Checklist',
  counter: 'Compteur',
  dice: 'Dés',
} as const
const widgetTitle = z.string().max(120)
const finiteNumber = z.number()
const localCounterSource = z
  .object({
    type: z.literal('local'),
    step: finiteNumber.positive(),
    min: finiteNumber.optional(),
    max: finiteNumber.optional(),
  })
  .strict()
export const gmWidget = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('note'),
        config: z.object({}).strict(),
        state: z.object({}).strict(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('checklist'),
        config: z
          .object({
            title: widgetTitle,
            items: z
              .array(
                z
                  .object({
                    id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
                    label: z.string().min(1).max(80),
                  })
                  .strict()
              )
              .max(40),
          })
          .strict(),
        state: z.object({ checkedIds: z.array(z.string()).max(40) }).strict(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('counter'),
        config: z
          .object({
            title: widgetTitle,
            source: z.union([
              localCounterSource,
              z
                .object({
                  type: z.literal('variable'),
                  variableId: z.string().min(1),
                  step: finiteNumber.positive(),
                })
                .strict(),
            ]),
          })
          .strict(),
        state: z.union([
          z.object({ value: finiteNumber }).strict(),
          z.object({}).strict(),
        ]),
      })
      .strict(),
    z
      .object({
        kind: z.literal('dice'),
        config: z
          .object({
            title: widgetTitle,
            expression: z.string().refine((value) => parseDice(value) !== null),
          })
          .strict(),
        state: z.object({}).strict(),
      })
      .strict(),
  ])
  .superRefine((widget, context) => {
    if (widget.kind === 'checklist') {
      const ids = new Set(widget.config.items.map((item) => item.id))
      if (
        ids.size !== widget.config.items.length ||
        new Set(widget.state.checkedIds).size !==
          widget.state.checkedIds.length ||
        widget.state.checkedIds.some((id) => !ids.has(id))
      )
        context.addIssue({ code: 'custom', message: 'Cases invalides' })
    }
    if (widget.kind === 'counter') {
      const source = widget.config.source
      if (source.type === 'variable') {
        if ('value' in widget.state)
          context.addIssue({ code: 'custom', message: 'État lié invalide' })
      } else if (
        !('value' in widget.state) ||
        (source.min !== undefined &&
          source.max !== undefined &&
          source.min > source.max) ||
        (source.min !== undefined && widget.state.value < source.min) ||
        (source.max !== undefined && widget.state.value > source.max)
      )
        context.addIssue({ code: 'custom', message: 'Bornes invalides' })
    }
  })
export function initialWidget(kind: (typeof gmWidgetKinds)[number]) {
  if (kind === 'checklist')
    return { kind, config: { title: '', items: [] }, state: { checkedIds: [] } }
  if (kind === 'counter')
    return {
      kind,
      config: { title: '', source: { type: 'local' as const, step: 1 } },
      state: { value: 0 },
    }
  if (kind === 'dice')
    return { kind, config: { title: '', expression: '1d20' }, state: {} }
  return { kind, config: {}, state: {} }
}
export const GM_WIDGET_BYTES = 16 * 1024
export const GM_LAYOUT_BYTES = 48 * 1024
export const GM_CONTENT_BYTES = 200 * 1024
