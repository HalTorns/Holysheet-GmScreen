import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
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

type Target =
  | { kind: 'note'; id: Id<'gmNotes'> }
  | { kind: 'layout'; id: Id<'gmLayouts'> }

export function RevisionHistory({
  target,
  version,
  disabled,
}: {
  target: Target
  version: number
  disabled: boolean
}) {
  const [open, setOpen] = useState(false)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        size="sm"
        variant="outline"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        {open ? 'Fermer l’historique' : 'Historique'}
      </Button>
      <DialogContent>
        <DialogTitle>
          Historique {target.kind === 'note' ? 'de la note' : 'du profil'}
        </DialogTitle>
        <DialogDescription>
          Revenez à une version enregistrée sans modifier les autres contenus.
        </DialogDescription>
        {open && (
          <RevisionList target={target} version={version} disabled={disabled} />
        )}
      </DialogContent>
    </Dialog>
  )
}

function RevisionList({
  target,
  version,
  disabled,
}: {
  target: Target
  version: number
  disabled: boolean
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.gmEditor.listHistory,
    { target },
    { initialNumItems: 5 }
  )
  const restore = useMutation(api.gmEditor.restoreRevision)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function apply(id: Id<'gmEditorHistory'>) {
    setPending(true)
    setError(null)
    try {
      await restore({ id, expectedVersion: version })
    } catch (error) {
      setError(operationErrorMessage(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <section
      aria-label="Versions enregistrées"
      className="mt-3 max-h-72 space-y-2 overflow-auto rounded-lg border bg-background p-3"
    >
      <p className="text-xs text-muted-foreground">
        20 versions précédentes conservées. Une restauration crée une nouvelle
        version.
      </p>
      {disabled && (
        <p className="text-xs">
          Enregistrez ou écartez le brouillon avant une restauration.
        </p>
      )}
      {status === 'LoadingFirstPage' && (
        <p role="status">Chargement de l’historique…</p>
      )}
      {status === 'Exhausted' && results.length === 0 && (
        <p>Aucune version précédente.</p>
      )}
      {results.map((revision) => (
        <div key={revision._id} className="rounded border p-2 text-xs">
          <p className="font-semibold">Version {revision.version}</p>
          <p className="max-h-16 overflow-auto break-words whitespace-pre-wrap">
            {revision.snapshot.kind === 'note'
              ? revision.snapshot.body.slice(0, 240) || 'Note vide'
              : `${revision.snapshot.name} · ${revision.snapshot.width} × ${revision.snapshot.height} px`}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || pending}
            onClick={() => void apply(revision._id)}
          >
            Restaurer la version {revision.version}
          </Button>
        </div>
      ))}
      {status === 'CanLoadMore' && (
        <Button size="sm" variant="outline" onClick={() => loadMore(5)}>
          Versions précédentes
        </Button>
      )}
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </section>
  )
}
