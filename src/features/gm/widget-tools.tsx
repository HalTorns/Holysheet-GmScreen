import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Layout, Widget } from '@convex/lib/gmFormats'
import { defaultWidgetStyle } from '@shared/gm'
import { arrangeWidgets, withoutGroup } from '@shared/gm-geometry'
import { useMutation, usePaginatedQuery } from 'convex/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import { operationErrorMessage } from '@/features/auth/errors'

type Placement = Layout['placements'][number]
export function WidgetTools({
  layout,
  placements,
  notes,
  activeId,
  disabled,
  draft,
  onChange,
  onPendingChange,
}: {
  layout: Layout
  placements: Placement[]
  notes: Widget[]
  activeId: Id<'gmNotes'> | undefined
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
  const [trashOpen, setTrashOpen] = useState(false)
  const selected = placements.filter((p) => selection.has(p.widgetId))
  const chosen = selected.length
    ? selected
    : placements.filter((p) => p.widgetId === activeId)
  const ids = new Set(chosen.map((p) => p.widgetId))
  const active = placements.find((p) => p.widgetId === activeId)
  const style = active?.style ?? defaultWidgetStyle
  const blocked = disabled || pending
  function source() {
    return notes
      .filter((n) => ids.has(n._id))
      .map((n) => ({ id: n._id, version: n.version }))
  }
  async function operate(operation: 'duplicate' | 'trash', copied = false) {
    const targets = copied ? clipboard : source()
    if (blocked || draft || !targets?.length) return
    setPending(true)
    onPendingChange(true)
    setError(null)
    try {
      await changeNotes({
        layoutId: layout._id,
        expectedVersion: layout.version,
        notes: targets,
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
  function patchStyle(changes: Partial<NonNullable<Placement['style']>>) {
    onChange(
      placements.map((p) =>
        ids.has(p.widgetId)
          ? { ...p, style: { ...(p.style ?? defaultWidgetStyle), ...changes } }
          : p
      )
    )
  }
  function group(ungroup: boolean) {
    const affectedGroups = new Set(chosen.map((p) => p.groupId).filter(Boolean))
    const groupId = chosen[0]?.widgetId
    if (!groupId) return
    onChange(
      placements.map((p) =>
        ids.has(p.widgetId) || (p.groupId && affectedGroups.has(p.groupId))
          ? ungroup
            ? withoutGroup(p)
            : { ...p, groupId }
          : p
      )
    )
  }
  return (
    <section
      aria-label="Outils des widgets"
      className="space-y-3 rounded-xl border bg-background p-3"
    >
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={blocked || draft || !chosen.length || chosen.length > 20}
          onClick={() => void operate('duplicate')}
        >
          Dupliquer
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={blocked || draft || !chosen.length || chosen.length > 20}
          onClick={() => setClipboard(source())}
        >
          Copier les widgets
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={blocked || draft || !clipboard?.length}
          onClick={() => void operate('duplicate', true)}
        >
          Coller les widgets
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={blocked || draft || !chosen.length || chosen.length > 20}
          onClick={() => void operate('trash')}
        >
          Mettre à la corbeille
        </Button>
        <Button size="sm" variant="outline" onClick={() => setTrashOpen(true)}>
          Corbeille
        </Button>
        {clipboard && (
          <span role="status" className="text-xs">
            {clipboard.length} widget(s) copié(s) dans cette vue
          </span>
        )}
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-semibold">
          Sélection, groupes et alignement
        </summary>
        <div className="my-2 flex max-h-32 flex-wrap gap-3 overflow-auto">
          {placements.map((p, i) => (
            <label key={p.widgetId} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={selection.has(p.widgetId)}
                disabled={blocked}
                onChange={(event) =>
                  setSelection((previous) => {
                    const next = new Set(previous)
                    if (event.target.checked) next.add(p.widgetId)
                    else next.delete(p.widgetId)
                    return next
                  })
                }
              />
              Sélectionner la note {i + 1}
            </label>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={blocked || selected.length < 2}
            onClick={() => group(false)}
          >
            Grouper
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={blocked || !chosen.some((p) => p.groupId)}
            onClick={() => group(true)}
          >
            Dégrouper
          </Button>
          {(
            [
              ['left', 'Aligner à gauche'],
              ['right', 'Aligner à droite'],
              ['top', 'Aligner en haut'],
              ['bottom', 'Aligner en bas'],
              ['horizontal', 'Distribuer horizontalement'],
              ['vertical', 'Distribuer verticalement'],
            ] as const
          ).map(([kind, label]) => (
            <Button
              key={kind}
              size="sm"
              variant="outline"
              disabled={
                blocked ||
                selected.length <
                  (kind === 'horizontal' || kind === 'vertical' ? 3 : 2)
              }
              onClick={() =>
                onChange(arrangeWidgets(placements, [...selection], kind))
              }
            >
              {label}
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Les groupes se déplacent ensemble. L’alignement traite chaque groupe
          comme un bloc. Les duplications et suppressions portent sur les notes
          cochées, au plus 20 par opération.
        </p>
      </details>
      {active && (
        <details>
          <summary className="cursor-pointer text-sm font-semibold">
            Style des notes sélectionnées
          </summary>
          <div className="mt-2 flex flex-wrap items-end gap-3">
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
                  disabled={blocked}
                  value={style[key]}
                  onChange={(event) =>
                    patchStyle({ [key]: event.target.value })
                  }
                />
              </label>
            ))}
            <label className="grid gap-1 text-xs">
              Police
              <select
                aria-label="Police des notes"
                className="rounded border p-2"
                disabled={blocked}
                value={style.fontFamily}
                onChange={(event) => {
                  const value = event.target.value
                  if (value === 'sans' || value === 'serif' || value === 'mono')
                    patchStyle({ fontFamily: value })
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
                  disabled={blocked}
                  onChange={(event) => {
                    const value = event.target.valueAsNumber
                    if (Number.isFinite(value))
                      patchStyle({
                        [key]: Math.min(max, Math.max(min, Math.round(value))),
                      })
                  }}
                />
              </label>
            ))}
            <Button
              size="sm"
              variant="outline"
              disabled={blocked}
              onClick={() =>
                onChange(
                  placements.map((p) =>
                    ids.has(p.widgetId)
                      ? (({ style: _style, ...rest }) => rest)(p)
                      : p
                  )
                )
              }
            >
              Réinitialiser le style
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Styles propres à ce profil. Sans sélection cochée, la note active
            est modifiée.
          </p>
        </details>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
      <Dialog open={trashOpen} onOpenChange={setTrashOpen}>
        <DialogContent>
          <DialogTitle>Corbeille du Screen</DialogTitle>
          <DialogDescription>
            Les notes restent restaurables, avec leur contenu et leurs anciens
            placements. Les groupes sont détachés à la restauration.
          </DialogDescription>
          {trashOpen && (
            <TrashList
              screenId={layout.screenId}
              disabled={blocked || draft}
              onPendingChange={onPendingChange}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
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
