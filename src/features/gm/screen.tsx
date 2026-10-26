import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useState } from 'react'

import { DraftGuard } from '@/components/draft-guard'
import { Button } from '@/components/ui/button'
import { operationErrorMessage } from '@/features/auth/errors'

export function Screen({ screenId }: { screenId: string }) {
  const data = useQuery(api.gm.getScreen, { id: screenId })
  const addNote = useMutation(api.gm.addNote)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const [locked, setLocked] = useState(false)
  async function add() {
    if (!data) return
    setPending(true)
    setError(null)
    try {
      await addNote({ screenId: data.screen._id })
    } catch (error) {
      setError(operationErrorMessage(error))
    } finally {
      setPending(false)
    }
  }
  if (data === undefined) return <p role="status">Chargement du Screen…</p>
  if (!data) return <p role="alert">Screen introuvable ou inaccessible.</p>
  const layout = data.layouts.find((item) => item.kind === 'digital')
  return (
    <>
      <Link
        to="/app/projects/$projectId"
        params={{ projectId: data.screen.projectId }}
        className="quiet-link"
      >
        ← Retour au projet
      </Link>
      <div className="page-heading mt-5">
        <div>
          <p className="eyebrow">
            SCREEN · {layout?.width} × {layout?.height} px
          </p>
          <h1>{data.screen.title}</h1>
          <p>
            Vos notes sont sauvegardées avec leur contenu, indépendamment de la
            mise en page.
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setLocked(!locked)}>
            {locked ? 'Reprendre l’édition' : 'Lecture seule'}
          </Button>
          <Button onClick={() => void add()} disabled={locked || pending}>
            {pending ? 'Ajout…' : 'Ajouter une note'}
          </Button>
        </div>
      </div>
      {error && (
        <p role="alert" className="field-error mb-4">
          {error}
        </p>
      )}
      <p className="mb-3 text-sm text-muted-foreground">
        {data.notes.length === 0
          ? 'Ajoutez une note, puis collez vos références.'
          : 'Enregistrez chaque note pour retrouver son contenu après réouverture.'}
      </p>
      {layout && (
        <div className="max-w-full overflow-auto rounded-xl border bg-muted/30 p-4">
          <div
            className="relative bg-background shadow-sm"
            style={{ width: layout.width, height: layout.height }}
            aria-label="Surface du Screen"
          >
            {layout.placements.map((placement) => {
              const note = data.notes.find(
                (item) => item._id === placement.noteId
              )
              return note ? (
                <section
                  key={note._id}
                  className="absolute overflow-hidden rounded-lg border bg-background p-3 shadow-sm"
                  style={{
                    left: placement.x,
                    top: placement.y,
                    width: placement.width,
                    height: placement.height,
                    zIndex: placement.layer,
                  }}
                >
                  <NoteEditor note={note} readOnly={locked} />
                </section>
              ) : null
            })}
          </div>
        </div>
      )}
    </>
  )
}

function NoteEditor({
  note,
  readOnly,
}: {
  note: Doc<'gmNotes'>
  readOnly: boolean
}) {
  const [draft, setDraft] = useState<{ body: string; version: number } | null>(
    null
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const update = useMutation(api.gm.updateNote)
  async function save() {
    if (!draft) return
    setPending(true)
    setError(null)
    try {
      await update({
        id: note._id,
        body: draft.body,
        expectedVersion: draft.version,
      })
      setDraft(null)
    } catch (error) {
      setError(operationErrorMessage(error))
    } finally {
      setPending(false)
    }
  }
  const conflict = draft !== null && draft.version !== note.version
  return (
    <div className="flex h-full flex-col gap-2">
      <DraftGuard dirty={draft !== null} />
      <label className="text-xs font-semibold" htmlFor={`note-${note._id}`}>
        Note
      </label>
      <textarea
        id={`note-${note._id}`}
        aria-label="Contenu de la note"
        className="min-h-10 flex-1 resize-none rounded border bg-background p-2 text-sm"
        value={draft?.body ?? note.body}
        readOnly={readOnly || pending}
        maxLength={50_000}
        onChange={(event) =>
          setDraft({
            body: event.target.value,
            version: draft?.version ?? note.version,
          })
        }
      />
      {conflict && (
        <div className="text-xs" role="alert">
          <p>
            Cette note a changé dans une autre vue. Votre brouillon est
            conservé.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setDraft(null)
              setError(null)
            }}
          >
            Charger la version enregistrée
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="field-error text-xs">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between">
        <span role="status" className="text-xs text-muted-foreground">
          {draft ? 'Modifications non enregistrées' : 'Enregistré'}
        </span>
        <Button
          size="sm"
          disabled={readOnly || !draft || pending || conflict}
          onClick={() => void save()}
        >
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  )
}
