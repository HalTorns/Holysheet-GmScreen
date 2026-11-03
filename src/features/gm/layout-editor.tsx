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
import { Ellipsis, Redo2, Settings2, Undo2 } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { DraftGuard } from '@/components/draft-guard'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/ui/menu'
import { SidePanel } from '@/components/ui/side-panel'

import { LayoutSettings } from './layout-settings'
import type { LayoutDialog } from './layout-settings'
import { RevisionHistory } from './revision-history'
import { WidgetContent } from './typed-widget'
import { useEditorDraft } from './use-editor-draft'
import { InspectorProvider, SaveControl, WidgetScope } from './widget-config'
import {
  SelectionBar,
  StyleControls,
  TrashDialog,
  useWidgetTools,
} from './widget-tools'
import type { WidgetTools } from './widget-tools'

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
export type ScreenMode = 'edit' | 'play' | 'read'
export type EditorDialog =
  | LayoutDialog
  | 'history'
  | 'goto'
  | 'trash'
  | 'shortcuts'
type Inspector = {
  tab: 'content' | 'style' | 'position'
  /** Widgets visés : un seul pour Contenu et Position. */
  ids: string[]
}

export const shortcuts = [
  ['Ctrl/Cmd + Z', 'Annuler la disposition'],
  ['Ctrl/Cmd + Maj + Z', 'Refaire la disposition'],
  ['Suppr', 'Mettre la sélection à la corbeille'],
  ['Ctrl/Cmd + D', 'Dupliquer'],
  ['Ctrl/Cmd + C, Ctrl/Cmd + V', 'Copier, coller les widgets'],
  ['Maj + clic', 'Ajouter ou retirer de la sélection'],
  ['Maj + F10', 'Menu du widget'],
  ['Flèches sur la poignée', 'Déplacer de 1 px (Maj : ×10)'],
  ['Échap', 'Vider la sélection'],
  ['?', 'Afficher les raccourcis'],
] as const

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

function editable(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    target.closest(
      'input, textarea, select, iframe, [contenteditable="true"], [role="dialog"], [role="menu"]'
    ) !== null
  )
}

function widgetName(note: Widget, index: number) {
  return `${gmWidgetLabels[note.kind]} ${index + 1}`
}

export function LayoutEditor({
  layout,
  notes,
  variables,
  mode,
  locked,
  autoSave,
  grid,
  dialog,
  toolbarSlot,
  onDialogChange,
  onDirtyChange,
  onProfileCreated,
}: {
  layout: Layout
  notes: Widget[]
  variables: Doc<'gmVariables'>[] | undefined
  mode: ScreenMode
  locked: boolean
  autoSave: boolean
  grid: boolean
  dialog: EditorDialog | null
  /** En-tête du Screen où rendre Annuler, Refaire et l'état. */
  toolbarSlot: HTMLElement | null
  onDialogChange: (dialog: EditorDialog | null) => void
  onDirtyChange: (dirty: boolean) => void
  onProfileCreated: (id: Id<'gmLayouts'>) => void
}) {
  const update = useMutation(api.gmEditor.updateLayout)
  const [selected, setSelected] = useState<Id<'gmNotes'> | null>(null)
  const [zoom, setZoom] = useState(100)
  const [gesture, setGesture] = useState<Gesture | null>(null)
  const [noteDrafts, setNoteDrafts] = useState<Set<string>>(() => new Set())
  const [toolsPending, setToolsPending] = useState(false)
  const [inspector, setInspector] = useState<Inspector | null>(null)
  const [slot, setSlot] = useState<HTMLElement | null>(null)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const readOnly = mode === 'read'
  const editing = mode === 'edit'
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
  // Le mode Jeu bloque localement disposition et configuration, comme le
  // verrou partagé, sans l'écrire.
  const blocked = locked || !editing || toolsPending
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
  const active = current.placements.find((p) => p.widgetId === selected)
  const geometryBlocked = blocked || editor.pending || gesture !== null
  const tools = useWidgetTools({
    layout,
    placements: current.placements,
    notes,
    disabled: geometryBlocked,
    draft: editor.dirty || noteDrafts.size > 0,
    onChange: (placements) => editor.edit({ ...current, placements }),
    onPendingChange: setToolsPending,
  })
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
  // Les panneaux d'édition n'existent qu'en Édition.
  if (!editing && (inspector !== null || tools.selection.size > 0)) {
    setInspector(null)
    tools.clear()
  }

  function alter(id: Id<'gmNotes'>, changes: Partial<Placement>) {
    if (geometryBlocked) return
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
  function layer(id: string, front: boolean) {
    const target = current.placements.find((p) => p.widgetId === id)
    if (!target || geometryBlocked) return
    const others = current.placements
      .filter((p) => p.widgetId !== id)
      .sort((a, b) => a.layer - b.layer)
    const ordered = front ? [...others, target] : [target, ...others]
    editor.edit({
      ...current,
      placements: current.placements.map((p) => ({
        ...p,
        layer: ordered.findIndex((item) => item.widgetId === p.widgetId),
      })),
    })
  }
  function pick(id: Id<'gmNotes'>, extend: boolean) {
    if (!editing) return
    if (extend) {
      if (tools.selection.size === 0 && selected && selected !== id)
        tools.toggle(selected)
      tools.toggle(id)
    }
    setSelected(id)
  }
  function inspect(tab: Inspector['tab'], ids: string[]) {
    if (!editing || ids.length === 0) return
    setInspector({ tab, ids })
  }
  function goTo(id: Id<'gmNotes'>) {
    onDialogChange(null)
    setSelected(id)
    setInspector({ tab: 'position', ids: [id] })
    requestAnimationFrame(() =>
      document
        .querySelector(`[data-widget-id="${id}"]`)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
    )
  }
  function start(
    event: PointerEvent<HTMLButtonElement>,
    placement: Placement,
    kind: Gesture['kind']
  ) {
    if (event.button !== 0 || !event.isPrimary) return
    if (kind === 'move' && (event.shiftKey || event.ctrlKey || event.metaKey)) {
      pick(placement.widgetId, true)
      return
    }
    setSelected(placement.widgetId)
    if (blocked || editor.pending) return
    event.preventDefault()
    event.currentTarget.focus()
    event.currentTarget.setPointerCapture(event.pointerId)
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
      kind === 'move' &&
      ((event.shiftKey && event.key === 'F10') || event.key === 'ContextMenu')
    ) {
      event.preventDefault()
      setSelected(placement.widgetId)
      setMenuFor(placement.widgetId)
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
  // Raccourcis de l'éditeur, hors champs de saisie, cadres et menus.
  useEffect(() => {
    if (!editing) return undefined
    function onKey(event: globalThis.KeyboardEvent) {
      if (event.defaultPrevented || editable(event.target)) return
      const command = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const ids = tools.targets(selected ?? undefined)
      if (command && (key === 'z' || key === 'y')) {
        if (blocked) return
        event.preventDefault()
        if (event.shiftKey || key === 'y') void editor.redo()
        else void editor.undo()
      } else if (!command && (key === 'delete' || key === 'backspace')) {
        if (!tools.canOperate(ids)) return
        event.preventDefault()
        tools.trash(ids)
      } else if (command && key === 'd') {
        event.preventDefault()
        if (tools.canOperate(ids)) tools.duplicate(ids)
      } else if (command && key === 'c') {
        if (!window.getSelection()?.isCollapsed) return
        if (tools.canOperate(ids)) tools.copy(ids)
      } else if (command && key === 'v') {
        if (tools.clipboard?.length && !tools.blocked) tools.paste()
      } else if (key === 'escape') {
        tools.clear()
        setSelected(null)
      } else if (event.key === '?') {
        onDialogChange('shortcuts')
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const inspected = inspector
    ? current.placements.filter((p) => inspector.ids.includes(p.widgetId))
    : []
  const single = inspected.length === 1 ? inspected[0] : undefined
  const tab = inspector && !single ? 'style' : inspector?.tab
  const headerControls = editing && (
    <div className="flex items-center gap-1">
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Annuler la disposition"
        title="Annuler la disposition (Ctrl/Cmd + Z)"
        disabled={!editor.canUndo || blocked}
        onClick={() => void editor.undo()}
      >
        <Undo2 />
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Refaire la disposition"
        title="Refaire la disposition (Ctrl/Cmd + Maj + Z)"
        disabled={!editor.canRedo || blocked}
        onClick={() => void editor.redo()}
      >
        <Redo2 />
      </Button>
      <SaveControl
        editor={editor}
        autoSave={autoSave}
        disabled={blocked || gesture !== null}
        label="Enregistrer la disposition"
      />
      <span role="status" className="text-xs text-muted-foreground">
        Disposition : {editor.status}
      </span>
    </div>
  )

  return (
    <InspectorProvider
      value={{
        targetId: tab === 'content' && single ? single.widgetId : null,
        slot,
      }}
    >
      <div
        role="group"
        aria-label="Éditeur de disposition"
        className="space-y-3"
      >
        <DraftGuard dirty={editor.dirty || gesture !== null || toolsPending} />
        {headerControls &&
          (toolbarSlot
            ? createPortal(headerControls, toolbarSlot)
            : headerControls)}
        {editor.conflict && (
          <div
            role="alert"
            className="rounded border border-amber-500 p-3 text-sm"
          >
            <p>
              Ce profil a changé dans une autre vue. Votre disposition locale
              est conservée.
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
        {(editor.error || tools.error) && (
          <p role="alert" className="field-error">
            {editor.error ?? tools.error}
          </p>
        )}
        {tools.clipboard && (
          <p role="status" className="text-xs text-muted-foreground">
            {tools.clipboard.length} widget(s) copié(s) dans cette vue
          </p>
        )}
        {notes.length === 0 && (
          <p>
            {editing
              ? 'Ajoutez un premier widget avec le bouton ＋.'
              : 'Ce Screen est vide.'}
          </p>
        )}
        {editing && (
          <SelectionBar
            tools={tools}
            draft={editor.dirty || noteDrafts.size > 0}
            onStyle={() => inspect('style', tools.selected)}
          />
        )}
        <div className="relative">
          <div
            className="max-h-[75dvh] max-w-full overflow-auto rounded-xl border bg-muted/30 p-4"
            aria-label="Vue défilante du Screen"
            onPointerDown={(event) => {
              if (event.target === event.currentTarget) {
                tools.clear()
                setSelected(null)
              }
            }}
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
                onPointerDown={(event) => {
                  if (event.target === event.currentTarget) {
                    tools.clear()
                    setSelected(null)
                  }
                }}
                style={{
                  width: current.width,
                  height: current.height,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                  ...(grid && editing
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
                  const note = notes.find(
                    (item) => item._id === placement.widgetId
                  )
                  if (!note) return null
                  return (
                    <WidgetFrame
                      key={note._id}
                      note={note}
                      index={index}
                      placement={placement}
                      editing={editing}
                      active={active?.widgetId === note._id}
                      chosen={tools.selection.has(note._id)}
                      onSelect={(extend) => pick(note._id, extend)}
                      actions={
                        <WidgetActions
                          id={note._id}
                          tools={tools}
                          locked={blocked}
                          onConfigure={() => {
                            setSelected(note._id)
                            inspect('content', [note._id])
                          }}
                          onHistory={() => {
                            setSelected(note._id)
                            setInspector({ tab: 'content', ids: [note._id] })
                          }}
                          onStyle={() =>
                            inspect('style', tools.targets(note._id))
                          }
                          onLayer={(front) => layer(note._id, front)}
                        />
                      }
                      menuOpen={menuFor === note._id}
                      onMenuOpenChange={(open) =>
                        // Un menu qui se ferme après l'ouverture d'un autre
                        // ne doit pas refermer ce dernier.
                        setMenuFor((previous) =>
                          open
                            ? note._id
                            : previous === note._id
                              ? null
                              : previous
                        )
                      }
                      onConfigure={() => {
                        setSelected(note._id)
                        inspect('content', [note._id])
                      }}
                      handleDisabled={blocked || editor.pending}
                      onHandlePointerDown={(event) =>
                        start(event, placement, 'move')
                      }
                      onResizePointerDown={(event) =>
                        start(event, placement, 'resize')
                      }
                      onPointerMove={move}
                      onPointerUp={finish}
                      onPointerCancel={() => setGesture(null)}
                      onHandleKeyDown={(event) =>
                        keyboard(event, placement, 'move')
                      }
                      onResizeKeyDown={(event) =>
                        keyboard(event, placement, 'resize')
                      }
                    >
                      <WidgetScope id={note._id}>
                        <WidgetContent
                          note={note}
                          variables={variables}
                          locked={locked || mode === 'play'}
                          play={mode === 'play' && !locked}
                          index={index}
                          readOnly={readOnly || toolsPending}
                          autoSave={autoSave}
                          onDirtyChange={reportNoteDraft}
                        />
                      </WidgetScope>
                    </WidgetFrame>
                  )
                })}
              </div>
            </div>
          </div>
          <label className="absolute right-3 bottom-3 flex items-center gap-1 rounded-lg border border-border bg-background/90 px-2 py-1 text-xs shadow-sm">
            <span className="sr-only">Zoom</span>
            <select
              aria-label="Zoom du Screen"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
              className="bg-transparent"
            >
              {[25, 50, 75, 100, 125, 150, 200].map((value) => (
                <option key={value} value={value}>
                  {value} %
                </option>
              ))}
            </select>
          </label>
        </div>
        <SidePanel
          open={inspector !== null && inspected.length > 0}
          title="Inspecteur"
          onClose={() => setInspector(null)}
        >
          <div
            role="tablist"
            aria-label="Sections de l’inspecteur"
            className="mb-3 flex gap-1"
          >
            {(
              [
                ['content', 'Contenu'],
                ['style', 'Style'],
                ['position', 'Position'],
              ] as const
            ).map(([key, label]) => (
              <Button
                key={key}
                role="tab"
                size="sm"
                variant={tab === key ? 'secondary' : 'ghost'}
                aria-selected={tab === key}
                disabled={key !== 'style' && !single}
                onClick={() =>
                  setInspector((previous) =>
                    previous ? { ...previous, tab: key } : previous
                  )
                }
              >
                {label}
              </Button>
            ))}
          </div>
          {single && (
            <p className="mb-2 text-xs text-muted-foreground">
              {(() => {
                const index = current.placements.indexOf(single)
                const note = notes.find((n) => n._id === single.widgetId)
                return note ? widgetName(note, index) : ''
              })()}
            </p>
          )}
          {tab === 'content' && single && (
            <div role="tabpanel" aria-label="Contenu" className="space-y-3">
              <div ref={setSlot} className="space-y-2" />
            </div>
          )}
          {tab === 'style' && inspected.length > 0 && (
            <div role="tabpanel" aria-label="Style">
              <StyleControls
                tools={tools}
                ids={inspected.map((p) => p.widgetId)}
                style={inspected[0]?.style ?? defaultWidgetStyle}
              />
            </div>
          )}
          {tab === 'position' && single && (
            <PositionControls
              placement={single}
              disabled={geometryBlocked}
              onAlter={(changes) => alter(single.widgetId, changes)}
              onLayer={(front) => layer(single.widgetId, front)}
            />
          )}
        </SidePanel>
        <RevisionHistory
          target={{ kind: 'layout', id: layout._id }}
          version={layout.version}
          disabled={blocked || dirty}
          open={dialog === 'history'}
          onOpenChange={(open) => onDialogChange(open ? 'history' : null)}
        />
        <LayoutSettings
          layout={layout}
          disabled={blocked || dirty}
          dialog={dialog === 'settings' || dialog === 'profile' ? dialog : null}
          onDialogChange={onDialogChange}
          onCreated={onProfileCreated}
          onApply={(settings, version) =>
            editor.edit({ ...current, ...settings }, version)
          }
        />
        <TrashDialog
          screenId={layout.screenId}
          open={dialog === 'trash'}
          disabled={geometryBlocked || editor.dirty || noteDrafts.size > 0}
          onOpenChange={(open) => onDialogChange(open ? 'trash' : null)}
          onPendingChange={setToolsPending}
        />
        <Dialog
          open={dialog === 'goto'}
          onOpenChange={(open) => onDialogChange(open ? 'goto' : null)}
        >
          <DialogContent>
            <DialogTitle>Aller au widget</DialogTitle>
            <DialogDescription>
              Tous les widgets de ce profil, y compris ceux placés hors du cadre
              de {current.width} × {current.height} px.
            </DialogDescription>
            <ul className="max-h-80 space-y-1 overflow-auto">
              {current.placements.map((p, index) => {
                const note = notes.find((n) => n._id === p.widgetId)
                if (!note) return null
                const outside =
                  p.x >= current.width ||
                  p.y >= current.height ||
                  p.x + p.width <= 0 ||
                  p.y + p.height <= 0
                return (
                  <li key={p.widgetId}>
                    <Button
                      variant="ghost"
                      className="w-full justify-between"
                      disabled={!editing}
                      onClick={() => goTo(p.widgetId)}
                    >
                      {widgetName(note, index)}
                      <span className="text-xs text-muted-foreground">
                        {p.x}, {p.y}
                        {outside ? ' · hors cadre' : ''}
                      </span>
                    </Button>
                  </li>
                )
              })}
            </ul>
          </DialogContent>
        </Dialog>
      </div>
    </InspectorProvider>
  )
}

function WidgetFrame({
  note,
  index,
  placement,
  editing,
  active,
  chosen,
  actions,
  menuOpen,
  handleDisabled,
  children,
  onSelect,
  onMenuOpenChange,
  onConfigure,
  onHandlePointerDown,
  onResizePointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onHandleKeyDown,
  onResizeKeyDown,
}: {
  note: Widget
  index: number
  placement: Placement
  editing: boolean
  active: boolean
  chosen: boolean
  actions: ReactNode
  menuOpen: boolean
  handleDisabled: boolean
  children: ReactNode
  onSelect: (extend: boolean) => void
  onMenuOpenChange: (open: boolean) => void
  onConfigure: () => void
  onHandlePointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onResizePointerDown: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerMove: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerUp: (event: PointerEvent<HTMLButtonElement>) => void
  onPointerCancel: () => void
  onHandleKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
  onResizeKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void
}) {
  const widgetStyle = placement.style ?? defaultWidgetStyle
  const name = widgetName(note, index)
  // Le clic droit ouvre le menu ⋯ du widget. Le même arbre est rendu dans
  // tous les modes : changer de mode ne remonte pas les widgets.
  const section = useRef<HTMLElement>(null)
  const openMenu = useRef(() => {
    onSelect(false)
    onMenuOpenChange(true)
  })
  useEffect(() => {
    openMenu.current = () => {
      onSelect(false)
      onMenuOpenChange(true)
    }
  })
  useEffect(() => {
    const element = section.current
    if (!editing || !element) return undefined
    function onContext(event: MouseEvent) {
      event.preventDefault()
      openMenu.current()
    }
    element.addEventListener('contextmenu', onContext)
    return () => element.removeEventListener('contextmenu', onContext)
  }, [editing])
  const frame = (
    <section
      data-widget-id={note._id}
      aria-label={`Widget ${note.kind === 'sheet' ? 'fiche' : note.kind === 'table' ? 'tableau' : note.kind === 'clock' ? 'horloge' : note.kind} ${index + 1}`}
      className={`group absolute flex flex-col overflow-hidden rounded-lg border bg-background shadow-sm ${
        editing && (active || chosen) ? 'ring-2 ring-primary' : ''
      }`}
      ref={section}
      onPointerDownCapture={(event) => {
        if (
          editing &&
          event.target instanceof HTMLElement &&
          !event.target.closest('button[data-handle]')
        )
          onSelect(event.shiftKey || event.ctrlKey || event.metaKey)
      }}
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
      {editing && (
        <div className="flex shrink-0 items-center border-b bg-muted">
          <button
            type="button"
            data-handle
            className="min-w-0 flex-1 touch-none truncate px-2 py-1 text-left text-xs font-semibold disabled:cursor-default"
            aria-label={`Déplacer la note ${index + 1}`}
            aria-pressed={chosen}
            disabled={handleDisabled}
            onPointerDown={onHandlePointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerCancel}
            onLostPointerCapture={onPointerCancel}
            onKeyDown={onHandleKeyDown}
            onDoubleClick={onConfigure}
          >
            ⠿ {name}
            {placement.groupId ? ' · groupe' : ''}
          </button>
          <div
            className={`flex shrink-0 items-center ${
              active || chosen || menuOpen
                ? ''
                : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
            }`}
          >
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-6"
              aria-label={`Configurer le widget ${index + 1}`}
              title="Configurer"
              onClick={onConfigure}
            >
              <Settings2 />
            </Button>
            <Menu open={menuOpen} onOpenChange={onMenuOpenChange}>
              <MenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    className="size-6"
                    title="Plus d’actions"
                  />
                }
                aria-label={`Actions du widget ${index + 1}`}
              >
                <Ellipsis />
              </MenuTrigger>
              <MenuContent align="end">{actions}</MenuContent>
            </Menu>
          </div>
        </div>
      )}
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
        {children}
      </div>
      {editing && (
        <button
          type="button"
          data-handle
          className={`absolute right-0 bottom-0 h-5 w-5 cursor-se-resize touch-none rounded-tl border bg-muted text-xs disabled:hidden ${
            active || chosen
              ? ''
              : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100'
          }`}
          aria-label={`Redimensionner la note ${index + 1}`}
          disabled={handleDisabled}
          onPointerDown={onResizePointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerCancel}
          onLostPointerCapture={onPointerCancel}
          onKeyDown={onResizeKeyDown}
        >
          ↘
        </button>
      )}
    </section>
  )
  return frame
}

/** Menu ⋯ d'un widget, ouvert aussi par clic droit ou Maj+F10. */
function WidgetActions({
  id,
  tools,
  locked,
  onConfigure,
  onHistory,
  onStyle,
  onLayer,
}: {
  id: string
  tools: WidgetTools
  locked: boolean
  onConfigure: () => void
  onHistory: () => void
  onStyle: () => void
  onLayer: (front: boolean) => void
}) {
  const ids = tools.targets(id)
  const operable = tools.canOperate(ids)
  return (
    <>
      <MenuItem onClick={onConfigure}>Configurer…</MenuItem>
      <MenuItem onClick={onStyle}>Style…</MenuItem>
      <MenuItem onClick={onHistory}>Historique…</MenuItem>
      <MenuSeparator />
      <MenuItem
        disabled={!operable}
        shortcut="Ctrl+D"
        onClick={() => tools.duplicate(ids)}
      >
        Dupliquer
      </MenuItem>
      <MenuItem
        disabled={!operable}
        shortcut="Ctrl+C"
        onClick={() => tools.copy(ids)}
      >
        Copier les widgets
      </MenuItem>
      <MenuItem
        disabled={!tools.clipboard?.length || tools.blocked}
        shortcut="Ctrl+V"
        onClick={() => tools.paste()}
      >
        Coller les widgets
      </MenuItem>
      <MenuSeparator />
      <MenuCheckboxItem
        checked={tools.selection.has(id)}
        disabled={tools.blocked}
        onCheckedChange={() => tools.toggle(id)}
      >
        Ajouter à la sélection
      </MenuCheckboxItem>
      <MenuItem
        disabled={
          tools.blocked || tools.selected.length < 2 || !tools.selection.has(id)
        }
        onClick={() => tools.group(tools.selected, false)}
      >
        Grouper
      </MenuItem>
      <MenuItem
        disabled={tools.blocked || !tools.isGrouped(ids)}
        onClick={() => tools.group(ids, true)}
      >
        Dégrouper
      </MenuItem>
      <MenuItem disabled={locked} onClick={() => onLayer(true)}>
        Premier plan
      </MenuItem>
      <MenuItem disabled={locked} onClick={() => onLayer(false)}>
        Arrière-plan
      </MenuItem>
      <MenuSeparator />
      <MenuItem
        disabled={!operable}
        shortcut="Suppr"
        onClick={() => tools.trash(ids)}
      >
        Mettre à la corbeille
      </MenuItem>
    </>
  )
}

function PositionControls({
  placement,
  disabled,
  onAlter,
  onLayer,
}: {
  placement: Placement
  disabled: boolean
  onAlter: (changes: Partial<Placement>) => void
  onLayer: (front: boolean) => void
}) {
  return (
    <div
      role="tabpanel"
      aria-label="Position"
      className="flex flex-wrap items-end gap-3"
    >
      {(
        [
          { name: 'x', label: 'Position X', min: 0, max: 2 * GM_MAX_DIMENSION },
          { name: 'y', label: 'Position Y', min: 0, max: 2 * GM_MAX_DIMENSION },
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
            value={placement[field.name]}
            disabled={disabled}
            onChange={(event) => {
              if (
                event.target.value !== '' &&
                Number.isFinite(event.target.valueAsNumber)
              )
                onAlter({
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
        disabled={disabled}
        onClick={() => onLayer(false)}
      >
        Arrière-plan
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => onLayer(true)}
      >
        Premier plan
      </Button>
    </div>
  )
}
