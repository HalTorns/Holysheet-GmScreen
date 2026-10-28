import { api } from '@convex/_generated/api'
import type { Widget } from '@convex/lib/gmFormats'
import { CatchBoundary } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useCallback, useEffect } from 'react'

import { DraftGuard } from '@/components/draft-guard'
import { Button } from '@/components/ui/button'

import { RevisionHistory } from './revision-history'
import { useEditorDraft } from './use-editor-draft'

function LoadedNoteEditor({
  note,
  readOnly,
  autoSave,
  index,
  onDirtyChange,
}: {
  note: Widget & { body: string }
  readOnly: boolean
  autoSave: boolean
  index: number
  onDirtyChange: (id: string, dirty: boolean) => void
}) {
  const update = useMutation(api.gm.updateNote)
  const persist = useCallback(
    (body: string, expectedVersion: number) =>
      update({ id: note._id, body, expectedVersion }),
    [note._id, update]
  )
  const editor = useEditorDraft({
    value: note.body,
    version: note.version,
    onSave: persist,
    autoSave,
    paused: readOnly,
  })
  const dirty = editor.dirty || editor.pending
  useEffect(() => {
    onDirtyChange(note._id, dirty)
  }, [note._id, dirty, onDirtyChange])
  useEffect(
    () => () => {
      onDirtyChange(note._id, false)
    },
    [note._id, onDirtyChange]
  )
  return (
    <div className="flex h-full min-h-0 flex-col gap-2 overflow-auto">
      <DraftGuard dirty={editor.dirty} />
      <label className="text-xs font-semibold" htmlFor={`note-${note._id}`}>
        Note {index + 1}
      </label>
      <textarea
        id={`note-${note._id}`}
        aria-label="Contenu de la note"
        className="min-h-10 flex-1 resize-none rounded border bg-background p-2 text-sm"
        value={editor.value}
        readOnly={readOnly}
        maxLength={50_000}
        style={{
          backgroundColor: 'transparent',
          color: 'inherit',
          fontSize: 'inherit',
          fontFamily: 'inherit',
        }}
        onChange={(event) => editor.edit(event.target.value)}
      />
      {editor.conflict && (
        <div className="text-xs" role="alert">
          <p>
            Cette note a changé dans une autre vue. Votre brouillon est
            conservé.
          </p>
          <p className="max-h-16 overflow-auto border p-1 whitespace-pre-wrap">
            Version enregistrée : {note.body}
          </p>
          <Button
            size="sm"
            variant="outline"
            disabled={editor.pending}
            onClick={() => editor.discard()}
          >
            Charger la version enregistrée
          </Button>
        </div>
      )}
      {editor.error && (
        <p role="alert" className="field-error text-xs">
          {editor.error}
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-1">
        <span role="status" className="text-xs text-muted-foreground">
          {editor.status}
        </span>
        <Button
          size="sm"
          disabled={
            readOnly || !editor.dirty || editor.pending || editor.conflict
          }
          onClick={() => void editor.save()}
        >
          Enregistrer
        </Button>
      </div>
      <div className="flex flex-wrap gap-1">
        <Button
          size="sm"
          variant="ghost"
          disabled={!editor.canUndo}
          onClick={() => void editor.undo()}
        >
          Annuler le texte
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!editor.canRedo}
          onClick={() => void editor.redo()}
        >
          Refaire le texte
        </Button>
        <RevisionHistory
          target={{ kind: 'note', id: note._id }}
          version={note.version}
          disabled={readOnly || editor.dirty || editor.pending}
        />
      </div>
    </div>
  )
}

function NoteContent(props: {
  note: Widget
  readOnly: boolean
  autoSave: boolean
  index: number
  onDirtyChange: (id: string, dirty: boolean) => void
}) {
  const content = useQuery(api.gmWidgets.getNoteContent, { id: props.note._id })
  if (!content) return <p role="status">Chargement de la note…</p>
  return <LoadedNoteEditor {...props} note={{ ...props.note, ...content }} />
}

function NoteContentError({ reset }: { reset?: () => void }) {
  return (
    <div role="alert">
      <p>Le contenu de cette note est indisponible.</p>
      <Button size="sm" variant="outline" onClick={reset}>
        Réessayer le contenu
      </Button>
    </div>
  )
}
export function NoteEditor(props: Parameters<typeof NoteContent>[0]) {
  return (
    <CatchBoundary
      getResetKey={() => props.note._id}
      errorComponent={NoteContentError}
    >
      <NoteContent {...props} />
    </CatchBoundary>
  )
}
