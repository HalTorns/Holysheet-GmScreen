import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Layout, Widget } from '@convex/lib/gmFormats'
import { defaultWidgetStyle } from '@shared/gm'
import { arrangeWidgets, withoutGroup } from '@shared/gm-geometry'
import { useMutation, usePaginatedQuery } from 'convex/react'
import { ChevronDown, X } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { operationErrorMessage } from '@/features/auth/errors'

type Placement = Layout['placements'][number]
const arrangements = [
  ['left', 'Aligner à gauche'],
  ['right', 'Aligner à droite'],
  ['top', 'Aligner en haut'],
  ['bottom', 'Aligner en bas'],
  ['horizontal', 'Distribuer horizontalement'],
  ['vertical', 'Distribuer verticalement'],
] as const
type Arrangement = (typeof arrangements)[number][0]

/**
 * Sélection, presse-papiers, groupes, alignements et style des widgets. Les
 * opérations portent sur des identifiants explicites : la sélection si le
 * widget visé en fait partie, sinon ce seul widget.
 */
export function useWidgetTools({
  layout,
  placements,
  notes,
  disabled,
  draft,
  onChange,
  onPendingChange,
}: {
  layout: Layout
  placements: Placement[]
  notes: Widget[]
  disabled: boolean
  draft: boolean
  onChange: (placements: Placement[]) => void
  onPendingChange: (pending: boolean) => void
}) {
  const changeNotes = useMutation(api.gmWidgets.changeNotes)
  const [selection, setSelection] = useState<Set<string>>(() => new Set())
  const [clipboard, setClipboard] = useState<
    { id: Id<'gmNotes'>; version: number }[] | null
  >(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const present = new Set<string>(placements.map((p) => p.widgetId))
  const selected = [...selection].filter((id) => present.has(id))
  const blocked = disabled || pending
  function targets(id?: string) {
    if (id === undefined || selection.has(id)) return selected
    return [id]
  }
  function source(ids: string[]) {
    const wanted = new Set(ids)
    return notes
      .filter((n) => wanted.has(n._id))
      .map((n) => ({ id: n._id, version: n.version }))
  }
  function canOperate(ids: string[]) {
    return !blocked && !draft && ids.length > 0 && ids.length <= 20
  }
  async function operate(
    operation: 'duplicate' | 'trash',
    items: { id: Id<'gmNotes'>; version: number }[] | null
  ) {
    if (blocked || draft || !items?.length) return
    setPending(true)
    onPendingChange(true)
    setError(null)
    try {
      await changeNotes({
        layoutId: layout._id,
        expectedVersion: layout.version,
        notes: items,
        operation,
      })
      setSelection(new Set())
    } catch (error) {
      setError(operationErrorMessage(error))
    } finally {
      setPending(false)
      onPendingChange(false)
    }
  }
  function group(ids: string[], ungroup: boolean) {
    if (blocked) return
    const wanted = new Set(ids)
    const chosen = placements.filter((p) => wanted.has(p.widgetId))
    const affectedGroups = new Set(chosen.map((p) => p.groupId).filter(Boolean))
    const groupId = chosen[0]?.widgetId
    if (!groupId) return
    onChange(
      placements.map((p) =>
        wanted.has(p.widgetId) || (p.groupId && affectedGroups.has(p.groupId))
          ? ungroup
            ? withoutGroup(p)
            : { ...p, groupId }
          : p
      )
    )
  }
  function canArrange(kind: Arrangement) {
    return (
      !blocked &&
      selected.length >= (kind === 'horizontal' || kind === 'vertical' ? 3 : 2)
    )
  }
  function patchStyle(
    ids: string[],
    changes: Partial<NonNullable<Placement['style']>>
  ) {
    const wanted = new Set(ids)
    onChange(
      placements.map((p) =>
        wanted.has(p.widgetId)
          ? { ...p, style: { ...(p.style ?? defaultWidgetStyle), ...changes } }
          : p
      )
    )
  }
  function resetStyle(ids: string[]) {
    const wanted = new Set(ids)
    onChange(
      placements.map((p) =>
        wanted.has(p.widgetId) ? (({ style: _style, ...rest }) => rest)(p) : p
      )
    )
  }
  return {
    selection,
    selected,
    blocked,
    pending,
    error,
    clipboard,
    targets,
    canOperate,
    isGrouped: (ids: string[]) =>
      placements.some((p) => ids.includes(p.widgetId) && p.groupId),
    toggle(id: string) {
      setSelection((previous) => {
        const next = new Set(previous)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        return next
      })
    },
    clear: () => setSelection(new Set()),
    copy: (ids: string[]) => setClipboard(source(ids)),
    duplicate: (ids: string[]) => void operate('duplicate', source(ids)),
    paste: () => void operate('duplicate', clipboard),
    trash: (ids: string[]) => void operate('trash', source(ids)),
    group,
    canArrange,
    arrange(kind: Arrangement) {
      if (canArrange(kind)) onChange(arrangeWidgets(placements, selected, kind))
    },
    patchStyle,
    resetStyle,
  }
}
export type WidgetTools = ReturnType<typeof useWidgetTools>

/** Barre flottante, affichée à partir de deux widgets sélectionnés. */
export function SelectionBar({
  tools,
  draft,
  onStyle,
}: {
  tools: WidgetTools
  draft: boolean
  onStyle: () => void
}) {
  const ids = tools.selected
  if (ids.length < 2) return null
  const operable = tools.canOperate(ids)
  return (
    <div
      role="toolbar"
      aria-label="Sélection de widgets"
      className="sticky top-2 z-30 mb-2 flex flex-wrap items-center gap-2 rounded-xl border border-border bg-background p-2 shadow-md"
    >
      <span className="px-1 text-xs font-semibold">
        {ids.length} sélectionnés
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={tools.blocked}
        onClick={() => tools.group(ids, false)}
      >
        Grouper
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={tools.blocked || !tools.isGrouped(ids)}
        onClick={() => tools.group(ids, true)}
      >
        Dégrouper
      </Button>
      <Menu>
        <MenuTrigger
          render={<Button size="sm" variant="outline" />}
          disabled={tools.blocked}
        >
          Aligner
          <ChevronDown />
        </MenuTrigger>
        <MenuContent>
          {arrangements.map(([kind, label]) => (
            <MenuItem
              key={kind}
              disabled={!tools.canArrange(kind)}
              onClick={() => tools.arrange(kind)}
            >
              {label}
            </MenuItem>
          ))}
        </MenuContent>
      </Menu>
      <Button
        size="sm"
        variant="outline"
        disabled={!operable}
        onClick={() => tools.duplicate(ids)}
      >
        Dupliquer
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!operable}
        onClick={() => tools.copy(ids)}
      >
        Copier les widgets
      </Button>
      <Button size="sm" variant="outline" disabled={draft} onClick={onStyle}>
        Style…
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={!operable}
        onClick={() => tools.trash(ids)}
      >
        Mettre à la corbeille
      </Button>
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label="Vider la sélection"
        title="Vider la sélection (Échap)"
        onClick={() => tools.clear()}
      >
        <X />
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        Les groupes se déplacent ensemble. L’alignement traite chaque groupe
        comme un bloc. Au plus 20 widgets par duplication ou suppression.
      </p>
    </div>
  )
}

/** Onglet Style de l'inspecteur. */
export function StyleControls({
  tools,
  ids,
  style,
}: {
  tools: WidgetTools
  ids: string[]
  style: NonNullable<Placement['style']>
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      {(
        [
          ['background', 'Fond'],
          ['color', 'Texte'],
          ['borderColor', 'Bordure'],
        ] as const
      ).map(([key, label]) => (
        <label key={key} className="grid gap-1 text-xs">
          {label}
          <input
            aria-label={`Couleur ${label.toLowerCase()}`}
            type="color"
            disabled={tools.blocked}
            value={style[key]}
            onChange={(event) =>
              tools.patchStyle(ids, { [key]: event.target.value })
            }
          />
        </label>
      ))}
      <label className="grid gap-1 text-xs">
        Police
        <select
          aria-label="Police des notes"
          className="rounded border p-2"
          disabled={tools.blocked}
          value={style.fontFamily}
          onChange={(event) => {
            const value = event.target.value
            if (value === 'sans' || value === 'serif' || value === 'mono')
              tools.patchStyle(ids, { fontFamily: value })
          }}
        >
          <option value="sans">Sans empattement</option>
          <option value="serif">Avec empattements</option>
          <option value="mono">Monospace</option>
        </select>
      </label>
      {(
        [
          ['fontSize', 'Taille du texte', 10, 48],
          ['borderWidth', 'Épaisseur de bordure', 0, 8],
          ['radius', 'Arrondi', 0, 32],
          ['opacity', 'Opacité', 20, 100],
        ] as const
      ).map(([key, label, min, max]) => (
        <label key={key} className="grid gap-1 text-xs">
          {label}
          <input
            aria-label={label}
            className="w-24 rounded border p-2"
            type="number"
            min={min}
            max={max}
            value={style[key]}
            disabled={tools.blocked}
            onChange={(event) => {
              const value = event.target.valueAsNumber
              if (Number.isFinite(value))
                tools.patchStyle(ids, {
                  [key]: Math.min(max, Math.max(min, Math.round(value))),
                })
            }}
          />
        </label>
      ))}
      <Button
        size="sm"
        variant="outline"
        disabled={tools.blocked}
        onClick={() => tools.resetStyle(ids)}
      >
        Réinitialiser le style
      </Button>
      <p className="w-full text-xs text-muted-foreground">
        Styles propres à ce profil
        {ids.length > 1
          ? `, appliqués aux ${ids.length} widgets sélectionnés`
          : ''}
        .
      </p>
    </div>
  )
}

export function TrashDialog({
  screenId,
  open,
  disabled,
  onOpenChange,
  onPendingChange,
}: {
  screenId: Id<'gmScreens'>
  open: boolean
  disabled: boolean
  onOpenChange: (open: boolean) => void
  onPendingChange: (pending: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogTitle>Corbeille du Screen</DialogTitle>
        <DialogDescription>
          Les notes restent restaurables, avec leur contenu et leurs anciens
          placements. Les groupes sont détachés à la restauration.
        </DialogDescription>
        {open && (
          <TrashList
            screenId={screenId}
            disabled={disabled}
            onPendingChange={onPendingChange}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function TrashList({
  screenId,
  disabled,
  onPendingChange,
}: {
  screenId: Id<'gmScreens'>
  disabled: boolean
  onPendingChange: (value: boolean) => void
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.gmWidgets.listTrash,
    { screenId },
    { initialNumItems: 5 }
  )
  const restore = useMutation(api.gmWidgets.restoreNote)
  const purge = useMutation(api.gmWidgets.purgeNote)
  const [confirmation, setConfirmation] = useState<Widget | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function apply(note: Widget, permanently = false) {
    setPending(true)
    onPendingChange(true)
    setError(null)
    try {
      if (permanently)
        await purge({
          id: note._id,
          expectedVersion: note.version,
          confirmation: 'DELETE_NOTE',
        })
      else await restore({ id: note._id, expectedVersion: note.version })
      setConfirmation(null)
    } catch (error) {
      setError(operationErrorMessage(error))
    } finally {
      setPending(false)
      onPendingChange(false)
    }
  }
  return (
    <div className="max-h-80 space-y-3 overflow-auto">
      {status === 'LoadingFirstPage' && <p role="status">Chargement…</p>}
      {status === 'Exhausted' && !results.length && (
        <p>La corbeille est vide.</p>
      )}
      {results.map((note) => (
        <div key={note._id} className="rounded border p-2">
          <p className="max-h-20 overflow-auto text-sm whitespace-pre-wrap">
            {note.preview || 'Note vide'}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || pending}
            onClick={() => void apply(note)}
          >
            Restaurer cette note
          </Button>
          {confirmation?._id === note._id ? (
            <div className="mt-2 space-y-2 rounded border border-destructive p-2">
              <p>
                Effacer définitivement cette note et son historique ? Cette
                action est irréversible.
              </p>
              <Button
                size="sm"
                variant="destructive"
                disabled={disabled || pending}
                onClick={() => void apply(confirmation, true)}
              >
                Confirmer l’effacement définitif
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending}
                onClick={() => setConfirmation(null)}
              >
                Conserver la note
              </Button>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              disabled={disabled || pending}
              onClick={() => setConfirmation(note)}
            >
              Effacer définitivement
            </Button>
          )}
        </div>
      ))}
      {status === 'CanLoadMore' && (
        <Button variant="outline" onClick={() => loadMore(5)}>
          Voir plus de notes supprimées
        </Button>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </div>
  )
}
