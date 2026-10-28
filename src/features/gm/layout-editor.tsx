import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import type { Layout, Widget } from '@convex/lib/gmFormats'
import {
  GM_MAX_DIMENSION,
  GM_MIN_WIDGET_HEIGHT,
  GM_MIN_WIDGET_WIDTH,
  defaultWidgetStyle,
  gmWidgetLabels,
} from '@shared/gm'
import { moveWidgets } from '@shared/gm-geometry'
import { useMutation } from 'convex/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { KeyboardEvent, PointerEvent } from 'react'

import { DraftGuard } from '@/components/draft-guard'
import { Button } from '@/components/ui/button'

import { LayoutSettings } from './layout-settings'
import { RevisionHistory } from './revision-history'
import { WidgetContent } from './typed-widget'
import { useEditorDraft } from './use-editor-draft'
import { WidgetTools } from './widget-tools'

type Placement = Layout['placements'][number]
type LayoutState = Pick<Layout, 'name' | 'width' | 'height' | 'placements'>
type Gesture = {
  pointerId: number
  kind: 'move' | 'resize'
  startX: number
  startY: number
  original: Placement
  preview: Placement
  state: LayoutState
  version: number
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Math.round(value)))
}

function dragged(
  gesture: Gesture,
  x: number,
  y: number,
  scale: number,
  grid: boolean
): Placement {
  const step = grid ? 8 : 1
  const dx = Math.round((x - gesture.startX) / scale / step) * step
  const dy = Math.round((y - gesture.startY) / scale / step) * step
  return gesture.kind === 'move'
    ? {
        ...gesture.original,
        x: clamp(gesture.original.x + dx, 0, 2 * GM_MAX_DIMENSION),
        y: clamp(gesture.original.y + dy, 0, 2 * GM_MAX_DIMENSION),
      }
    : {
        ...gesture.original,
        width: clamp(
          gesture.original.width + dx,
          GM_MIN_WIDGET_WIDTH,
          GM_MAX_DIMENSION
        ),
        height: clamp(
          gesture.original.height + dy,
          GM_MIN_WIDGET_HEIGHT,
          GM_MAX_DIMENSION
        ),
      }
}

export function LayoutEditor({
  layout,
  notes,
  variables,
  readOnly,
  locked,
  autoSave,
  onDirtyChange,
  onProfileCreated,
}: {
  layout: Layout
  notes: Widget[]
  variables: Doc<'gmVariables'>[] | undefined
  readOnly: boolean
  locked: boolean
  autoSave: boolean
  onDirtyChange: (dirty: boolean) => void
  onProfileCreated: (id: Id<'gmLayouts'>) => void
}) {
  const update = useMutation(api.gmEditor.updateLayout)
  const [selected, setSelected] = useState<Id<'gmNotes'> | null>(null)
  const [grid, setGrid] = useState(false)
  const [zoom, setZoom] = useState(100)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Set<string>>(() => new Set())
  const [toolsPending, setToolsPending] = useState(false)
  const base = useMemo(
    () => ({
      name: layout.name,
      width: layout.width,
      height: layout.height,
      placements: layout.placements,
    }),
    [layout]
  )
  const persist = useCallback(
    (value: LayoutState, expectedVersion: number) =>
      update({ id: layout._id, expectedVersion, ...value }),
    [layout._id, update]
  )
  const blocked = locked || readOnly || toolsPending
  const editor = useEditorDraft({
    value: base,
    version: layout.version,
    onSave: persist,
    autoSave,
    paused: blocked || gesture !== null,
  })
  const dirty =
    editor.dirty ||
    editor.pending ||
    noteDrafts.size > 0 ||
    gesture !== null ||
    toolsPending
  const scale = zoom / 100
  const current = editor.value
  const active =
    current.placements.find((p) => p.widgetId === selected) ??
    current.placements[0]
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(
    () => () => {
      onDirtyChange(false)
    },
    [onDirtyChange]
  )
  const reportNoteDraft = useCallback((id: string, isDirty: boolean) => {
    setNoteDrafts((previous) => {
      if (previous.has(id) === isDirty) return previous
      const next = new Set(previous)
      if (isDirty) next.add(id)
      else next.delete(id)
      return next
    })
  }, [])

  function alter(id: Id<'gmNotes'>, changes: Partial<Placement>) {
    if (blocked || editor.pending || gesture) return
    const original = current.placements.find((p) => p.widgetId === id)
    if (original && (changes.x !== undefined || changes.y !== undefined)) {
      editor.edit({
        ...current,
        placements: moveWidgets(
          current.placements,
          id,
          (changes.x ?? original.x) - original.x,
          (changes.y ?? original.y) - original.y
        ),
      })
      return
    }
    editor.edit({
      ...current,
      placements: current.placements.map((p) =>
        p.widgetId === id ? { ...p, ...changes } : p
      ),
    })
  }
  function layer(front: boolean) {
    if (!active || blocked) return
    const others = current.placements
      .filter((p) => p.widgetId !== active.widgetId)
      .sort((a, b) => a.layer - b.layer)
    const ordered = front ? [...others, active] : [active, ...others]
    editor.edit({
      ...current,
      placements: current.placements.map((p) => ({
        ...p,
        layer: ordered.findIndex((item) => item.widgetId === p.widgetId),
      })),
    })
  }
  function start(
    event: PointerEvent<HTMLButtonElement>,
    placement: Placement,
    kind: Gesture['kind']
  ) {
    if (blocked || editor.pending || event.button !== 0 || !event.isPrimary)
      return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
    setSelected(placement.widgetId)
    setGesture({
      pointerId: event.pointerId,
      kind,
      startX: event.clientX,
      startY: event.clientY,
      original: placement,
      preview: placement,
      state: current,
      version: layout.version,
    })
  }
  function move(event: PointerEvent<HTMLButtonElement>) {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    setGesture({
      ...gesture,
      preview: dragged(gesture, event.clientX, event.clientY, scale, grid),
    })
  }
  function finish(event: PointerEvent<HTMLButtonElement>) {
    if (!gesture || event.pointerId !== gesture.pointerId) return
    const next = dragged(gesture, event.clientX, event.clientY, scale, grid)
    setGesture(null)
    if (blocked || JSON.stringify(next) === JSON.stringify(gesture.original))
      return
    editor.edit(
      {
        ...gesture.state,
        placements:
          gesture.kind === 'move'
            ? moveWidgets(
                gesture.state.placements,
                next.widgetId,
                next.x - gesture.original.x,
                next.y - gesture.original.y
              )
            : gesture.state.placements.map((p) =>
                p.widgetId === next.widgetId ? next : p
              ),
      },
      gesture.version
    )
  }
  function keyboard(
    event: KeyboardEvent<HTMLButtonElement>,
    placement: Placement,
    kind: Gesture['kind']
  ) {
    if (
      (event.ctrlKey || event.metaKey) &&
      !blocked &&
      ['z', 'y'].includes(event.key.toLowerCase())
    ) {
      event.preventDefault()
      if (event.shiftKey || event.key.toLowerCase() === 'y') void editor.redo()
      else void editor.undo()
      return
    }
    if (
      blocked ||
      editor.pending ||
      !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)
    )
      return
    event.preventDefault()
    const step = (grid ? 8 : 1) * (event.shiftKey ? 10 : 1)
    const dx =
      event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0
    const dy =
      event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0
    setSelected(placement.widgetId)
    alter(
      placement.widgetId,
      kind === 'move'
        ? {
            x: clamp(placement.x + dx, 0, 2 * GM_MAX_DIMENSION),
            y: clamp(placement.y + dy, 0, 2 * GM_MAX_DIMENSION),
          }
        : {
            width: clamp(
              placement.width + dx,
              GM_MIN_WIDGET_WIDTH,
              GM_MAX_DIMENSION
            ),
            height: clamp(
              placement.height + dy,
              GM_MIN_WIDGET_HEIGHT,
              GM_MAX_DIMENSION
            ),
          }
    )
  }

  return (
    <div role="group" aria-label="Éditeur de disposition" className="space-y-3">
      <DraftGuard dirty={editor.dirty || gesture !== null || toolsPending} />
      <div className="flex flex-wrap items-center gap-2">
        <LayoutSettings
          layout={layout}
          disabled={blocked || dirty}
          onCreated={onProfileCreated}
          onApply={(settings, version) =>
            editor.edit({ ...current, ...settings }, version)
          }
        />
        <Button
          variant="outline"
          disabled={!editor.canUndo}
          onClick={() => void editor.undo()}
        >
          Annuler la disposition
        </Button>
        <Button
          variant="outline"
          disabled={!editor.canRedo}
          onClick={() => void editor.redo()}
        >
          Refaire la disposition
        </Button>
        <Button
          disabled={
            blocked ||
            !editor.dirty ||
            editor.pending ||
            editor.conflict ||
            gesture !== null
          }
          onClick={() => void editor.save()}
        >
          Enregistrer la disposition
        </Button>
        <RevisionHistory
          target={{ kind: 'layout', id: layout._id }}
          version={layout.version}
          disabled={blocked || dirty}
        />
        <span role="status" className="text-xs text-muted-foreground">
          Disposition : {editor.status}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-sm">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={grid}
            onChange={(event) => setGrid(event.target.checked)}
          />
          Grille magnétique (8 px)
        </label>
        <label className="flex items-center gap-2">
          Zoom
          <select
            aria-label="Zoom du Screen"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
            className="rounded border bg-background p-1"
          >
            {[25, 50, 75, 100, 125, 150, 200].map((value) => (
              <option key={value} value={value}>
                {value} %
              </option>
            ))}
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          Flèches sur une poignée : 1 px · Maj : ×10 · Ctrl/Cmd Z : annuler la
          disposition.
        </p>
      </div>
      {editor.conflict && (
        <div
          role="alert"
          className="rounded border border-amber-500 p-3 text-sm"
        >
          <p>
            Ce profil a changé dans une autre vue. Votre disposition locale est
            conservée.
          </p>
          <Button
            variant="outline"
            disabled={editor.pending}
            onClick={() => editor.discard()}
          >
            Charger la disposition enregistrée
          </Button>
        </div>
      )}
      {editor.error && (
        <p role="alert" className="field-error">
          {editor.error}
        </p>
      )}
      {active && (
        <div
          className="flex flex-wrap items-end gap-3 rounded-xl border bg-background p-3"
          aria-label="Coordonnées de la note"
        >
          <label className="grid gap-1 text-xs">
            Note sélectionnée
            <select
              aria-label="Note sélectionnée"
              value={active.widgetId}
              onChange={(event) =>
                setSelected(
                  current.placements.find(
                    (item) => item.widgetId === event.target.value
                  )?.widgetId ?? null
                )
              }
              className="rounded border bg-background p-2"
            >
              {current.placements.map((p, index) => (
                <option key={p.widgetId} value={p.widgetId}>
                  Note {index + 1}
                </option>
              ))}
            </select>
          </label>
          {(
            [
              {
                name: 'x',
                label: 'Position X',
                min: 0,
                max: 2 * GM_MAX_DIMENSION,
              },
              {
                name: 'y',
                label: 'Position Y',
                min: 0,
                max: 2 * GM_MAX_DIMENSION,
              },
              {
                name: 'width',
                label: 'Largeur de la note',
                min: GM_MIN_WIDGET_WIDTH,
                max: GM_MAX_DIMENSION,
              },
              {
                name: 'height',
                label: 'Hauteur de la note',
                min: GM_MIN_WIDGET_HEIGHT,
                max: GM_MAX_DIMENSION,
              },
            ] as const
          ).map((field) => (
            <label key={field.name} className="grid gap-1 text-xs">
              {field.label}
              <input
                className="w-24 rounded border bg-background p-2"
                aria-label={field.label}
                type="number"
                step={1}
                min={field.min}
                max={field.max}
                value={active[field.name]}
                disabled={blocked || editor.pending || gesture !== null}
                onChange={(event) => {
                  if (
                    event.target.value !== '' &&
                    Number.isFinite(event.target.valueAsNumber)
                  )
                    alter(active.widgetId, {
                      [field.name]: clamp(
                        event.target.valueAsNumber,
                        field.min,
                        field.max
                      ),
                    })
                }}
              />
            </label>
          ))}
          <Button
            size="sm"
            variant="outline"
            disabled={blocked || editor.pending || gesture !== null}
            onClick={() => layer(false)}
          >
            Arrière-plan
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={blocked || editor.pending || gesture !== null}
            onClick={() => layer(true)}
          >
            Premier plan
          </Button>
        </div>
      )}
      {notes.length === 0 && (
        <p>Ajoutez une note, puis collez vos références.</p>
      )}
      <WidgetTools
        layout={layout}
        placements={current.placements}
        notes={notes}
        activeId={active?.widgetId}
        disabled={blocked || editor.pending || gesture !== null}
        draft={editor.dirty || noteDrafts.size > 0}
        onChange={(placements) => editor.edit({ ...current, placements })}
        onPendingChange={setToolsPending}
      />
      <div
        className="max-h-[75dvh] max-w-full overflow-auto rounded-xl border bg-muted/30 p-4"
        aria-label="Vue défilante du Screen"
      >
        <div
          style={{
            width: current.width * scale,
            height: current.height * scale,
          }}
        >
          <div
            role="group"
            aria-label="Surface du Screen"
            className="relative overflow-hidden bg-background shadow-sm"
            style={{
              width: current.width,
              height: current.height,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
              ...(grid
                ? {
                    backgroundImage:
                      'radial-gradient(#a1a1aa 1px, transparent 1px)',
                    backgroundSize: '8px 8px',
                  }
                : {}),
            }}
          >
            {current.placements.map((stored, index) => {
              const placement =
                gesture?.kind === 'move'
                  ? (moveWidgets(
                      gesture.state.placements,
                      gesture.original.widgetId,
                      gesture.preview.x - gesture.original.x,
                      gesture.preview.y - gesture.original.y
                    ).find((p) => p.widgetId === stored.widgetId) ?? stored)
                  : gesture?.original.widgetId === stored.widgetId
                    ? gesture.preview
                    : stored
              const note = notes.find((item) => item._id === placement.widgetId)
              if (!note) return null
              const widgetStyle = placement.style ?? defaultWidgetStyle
              return (
                <section
                  key={note._id}
                  aria-label={`Widget ${note.kind} ${index + 1}`}
                  className={`absolute flex flex-col overflow-hidden rounded-lg border bg-background shadow-sm ${active?.widgetId === note._id ? 'ring-2 ring-primary/40' : ''}`}
                  style={{
                    left: placement.x,
                    top: placement.y,
                    width: placement.width,
                    height: placement.height,
                    zIndex: placement.layer,
                    backgroundColor: widgetStyle.background,
                    color: widgetStyle.color,
                    borderColor: widgetStyle.borderColor,
                    borderWidth: widgetStyle.borderWidth,
                    borderRadius: widgetStyle.radius,
                    opacity: widgetStyle.opacity / 100,
                  }}
                >
                  <button
                    type="button"
                    className="shrink-0 touch-none border-b bg-muted px-2 py-1 text-left text-xs font-semibold disabled:cursor-default"
                    aria-label={`Déplacer la note ${index + 1}`}
                    disabled={blocked || editor.pending}
                    onPointerDown={(event) => start(event, placement, 'move')}
                    onPointerMove={move}
                    onPointerUp={finish}
                    onPointerCancel={() => setGesture(null)}
                    onLostPointerCapture={() => setGesture(null)}
                    onKeyDown={(event) => keyboard(event, placement, 'move')}
                  >
                    ⠿ {gmWidgetLabels[note.kind]} {index + 1}
                    {placement.groupId ? ' · groupe' : ''}
                  </button>
                  <div
                    className="min-h-0 flex-1 p-2"
                    style={{
                      fontSize: widgetStyle.fontSize,
                      fontFamily:
                        widgetStyle.fontFamily === 'serif'
                          ? 'serif'
                          : widgetStyle.fontFamily === 'mono'
                            ? 'monospace'
                            : 'sans-serif',
                    }}
                  >
                    <WidgetContent
                      note={note}
                      variables={variables}
                      locked={locked}
                      index={index}
                      readOnly={readOnly || toolsPending}
                      autoSave={autoSave}
                      onDirtyChange={reportNoteDraft}
                    />
                  </div>
                  <button
                    type="button"
                    className="absolute right-0 bottom-0 h-5 w-5 cursor-se-resize touch-none rounded-tl border bg-muted text-xs disabled:hidden"
                    aria-label={`Redimensionner la note ${index + 1}`}
                    disabled={blocked || editor.pending}
                    onPointerDown={(event) => start(event, placement, 'resize')}
                    onPointerMove={move}
                    onPointerUp={finish}
                    onPointerCancel={() => setGesture(null)}
                    onLostPointerCapture={() => setGesture(null)}
                    onKeyDown={(event) => keyboard(event, placement, 'resize')}
                  >
                    ↘
                  </button>
                </section>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
