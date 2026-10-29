import { parseDice } from './dice.ts'
import { z } from './zod.ts'

export const gmTitle = z.string().trim().min(1).max(120)
export const gmBodyFormat = z.enum(['plain', 'markdown-v1'])
export type NoteValue = {
  body: string
  bodyFormat: z.infer<typeof gmBodyFormat>
}
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

export const gmWidgetKinds = [
  'note',
  'checklist',
  'counter',
  'dice',
  'sheet',
  'table',
  'clock',
  'initiative',
] as const
export const gmWidgetLabels = {
  note: 'Note',
  checklist: 'Checklist',
  counter: 'Compteur',
  dice: 'Dés',
  sheet: 'Fiche',
  table: 'Tableau',
  clock: 'Horloge',
  initiative: 'Initiative',
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
const widgetId = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/)
export const gmWidget = z
  .discriminatedUnion('kind', [
    z
      .object({
        kind: z.literal('table'),
        config: z
          .object({
            title: widgetTitle,
            columns: z
              .array(
                z.object({ id: widgetId, label: z.string().max(60) }).strict()
              )
              .min(1)
              .max(12),
          })
          .strict(),
        state: z
          .object({
            rows: z
              .array(
                z
                  .object({
                    id: widgetId,
                    cells: z.array(z.string().max(500)).max(12),
                  })
                  .strict()
              )
              .max(100),
          })
          .strict(),
      })
      .strict(),
    z
      .object({
        kind: z.literal('clock'),
        config: z.discriminatedUnion('mode', [
          z
            .object({ title: widgetTitle, mode: z.literal('stopwatch') })
            .strict(),
          z
            .object({
              title: widgetTitle,
              mode: z.literal('timer'),
              durationMs: z.number().int().min(1000).max(86_400_000),
            })
            .strict(),
          z
            .object({
              title: widgetTitle,
              mode: z.literal('segments'),
              segments: z.number().int().min(2).max(12),
            })
            .strict(),
        ]),
        state: z.union([
          z
            .object({
              running: z.boolean(),
              startedAt: z.number().nonnegative().optional(),
              elapsedMs: z.number().nonnegative(),
            })
            .strict(),
          z.object({ filled: z.number().int().nonnegative() }).strict(),
        ]),
      })
      .strict(),
    z
      .object({
        kind: z.literal('initiative'),
        config: z.object({ title: widgetTitle }).strict(),
        state: z
          .object({
            entries: z
              .array(
                z
                  .object({
                    id: widgetId,
                    name: z.string().min(1).max(60),
                    score: z.number().min(-999).max(999),
                    note: z.string().max(120),
                  })
                  .strict()
              )
              .max(30),
            currentId: widgetId.optional(),
            round: z.number().int().min(1),
          })
          .strict(),
      })
      .strict(),

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
        kind: z.literal('sheet'),
        config: z
          .object({
            title: widgetTitle,
            sheetId: z.string().min(1).optional(),
            display: z.enum(['summary', 'fields', 'full']),
            fieldLabels: z
              .array(z.string().min(1).max(60))
              .max(40)
              .refine((labels) => new Set(labels).size === labels.length),
          })
          .strict(),
        state: z.object({}).strict(),
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
    if (
      widget.kind === 'table' &&
      (new Set(widget.config.columns.map((column) => column.id)).size !==
        widget.config.columns.length ||
        new Set(widget.state.rows.map((row) => row.id)).size !==
          widget.state.rows.length ||
        widget.state.rows.some(
          (row) => row.cells.length !== widget.config.columns.length
        ))
    )
      context.addIssue({ code: 'custom', message: 'Tableau invalide' })
    if (widget.kind === 'clock') {
      const { config, state } = widget
      if (
        config.mode === 'segments'
          ? !('filled' in state) || state.filled > config.segments
          : !('running' in state) ||
            state.running !== (state.startedAt !== undefined)
      )
        context.addIssue({ code: 'custom', message: 'Horloge invalide' })
    }
    if (
      widget.kind === 'initiative' &&
      (new Set(widget.state.entries.map((entry) => entry.id)).size !==
        widget.state.entries.length ||
        (widget.state.currentId !== undefined &&
          !widget.state.entries.some(
            (entry) => entry.id === widget.state.currentId
          )))
    )
      context.addIssue({ code: 'custom', message: 'Initiative invalide' })
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
export function initialWidget<Kind extends (typeof gmWidgetKinds)[number]>(
  kind: Kind
): Extract<ReturnType<typeof createInitialWidget>, { kind: Kind }>
export function initialWidget(kind: (typeof gmWidgetKinds)[number]) {
  return createInitialWidget(kind)
}
function createInitialWidget(kind: (typeof gmWidgetKinds)[number]) {
  if (kind === 'table')
    return {
      kind,
      config: {
        title: '',
        columns: [
          { id: 'column-1', label: 'Colonne 1' },
          { id: 'column-2', label: 'Colonne 2' },
        ],
      },
      state: { rows: [{ id: 'row-1', cells: ['', ''] }] },
    }
  if (kind === 'clock')
    return {
      kind,
      config: { title: '', mode: 'stopwatch' as const },
      state: { running: false, elapsedMs: 0 },
    }
  if (kind === 'initiative')
    return { kind, config: { title: '' }, state: { entries: [], round: 1 } }
  if (kind === 'checklist')
    return { kind, config: { title: '', items: [] }, state: { checkedIds: [] } }
  if (kind === 'counter')
    return {
      kind,
      config: { title: '', source: { type: 'local' as const, step: 1 } },
      state: { value: 0 },
    }
  if (kind === 'sheet')
    return {
      kind,
      config: { title: '', display: 'summary' as const, fieldLabels: [] },
      state: {},
    }
  if (kind === 'dice')
    return { kind, config: { title: '', expression: '1d20' }, state: {} }
  return { kind, config: {}, state: {} }
}
export const GM_WIDGET_BYTES = 16 * 1024
export const GM_LAYOUT_BYTES = 48 * 1024
export const GM_CONTENT_BYTES = 200 * 1024
