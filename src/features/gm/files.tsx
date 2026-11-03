import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { useConvex, useMutation, usePaginatedQuery } from 'convex/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { operationErrorMessage } from '@/features/auth/errors'

import { useFileUpload } from './file-upload'
import { RowAction, RowActions } from './page-actions'

export function Files({
  projectId,
  onChoose,
}: {
  projectId: Id<'gmProjects'>
  onChoose?: ((file: Doc<'gmFiles'>) => Promise<unknown>) | undefined
}) {
  const [trash, setTrash] = useState(false)
  const files = usePaginatedQuery(
    api.gmFiles.listFiles,
    { projectId, trash },
    { initialNumItems: 20 }
  )
  const upload = useFileUpload(projectId)
  const rename = useMutation(api.gmFiles.renameFile)
  const setTrashed = useMutation(api.gmFiles.setTrashed)
  const purge = useMutation(api.gmFiles.purgeFile)
  const client = useConvex()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function perform(action: () => Promise<unknown>) {
    setPending(true)
    setError(null)
    try {
      await action()
    } catch (error_) {
      setError(operationErrorMessage(error_))
    } finally {
      setPending(false)
    }
  }
  async function trashFile(file: Doc<'gmFiles'>) {
    let count = 0
    let cursor: string | null = null
    while (true) {
      const result: { count: number; isDone: boolean; continueCursor: string } =
        await client.query(api.gmFiles.references, {
          id: file._id,
          paginationOpts: { cursor, numItems: 100 },
        })
      count += result.count
      if (result.isDone) break
      cursor = result.continueCursor
    }
    if (
      window.confirm(
        `Mettre « ${file.name} » en corbeille ? ${count} widget(s) afficheront « Fichier indisponible ».`
      )
    )
      await setTrashed({ id: file._id, trash: true })
  }
  return (
    <section aria-label="Fichiers" className="panel my-5 grid gap-3 p-5">
      <h2>Fichiers</h2>
      <p>
        PNG, JPEG, WebP, GIF : 10 Mio · PDF : 16 Mio · 500 Mio par compte · 200
        fichiers par projet, corbeille comprise.
      </p>
      <label>
        Importer un fichier
        <input
          aria-label="Importer un fichier"
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,application/pdf"
          disabled={pending || upload.pending}
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void perform(() => upload.upload(file))
            event.target.value = ''
          }}
        />
      </label>
      <div className="flex gap-1" role="group" aria-label="Vue des fichiers">
        {(
          [
            [false, 'Fichiers actifs'],
            [true, 'Corbeille des fichiers'],
          ] as const
        ).map(([value, label]) => (
          <Button
            key={label}
            size="sm"
            variant={trash === value ? 'secondary' : 'ghost'}
            aria-pressed={trash === value}
            onClick={() => setTrash(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      {files.results.map((file) => (
        <div
          key={file._id}
          className="flex flex-wrap items-center gap-2"
          data-file-name={file.name}
        >
          <span className="min-w-0 flex-1 truncate">
            {file.name} · {file.mimeType} · {file.size} octets
          </span>
          {!trash && onChoose && (
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => void perform(() => onChoose(file))}
            >
              Placer {file.name}
            </Button>
          )}
          <RowActions label={file.name} disabled={pending}>
            <RowAction
              onClick={() => {
                const name = window.prompt('Nom du fichier', file.name)
                if (name) void perform(() => rename({ id: file._id, name }))
              }}
            >
              Renommer {file.name}
            </RowAction>
            {trash ? (
              <>
                <RowAction
                  onClick={() =>
                    void perform(() =>
                      setTrashed({ id: file._id, trash: false })
                    )
                  }
                >
                  Restaurer {file.name}
                </RowAction>
                <RowAction
                  onClick={() => {
                    if (
                      window.confirm(
                        `Supprimer définitivement « ${file.name} » et son contenu ?`
                      )
                    )
                      void perform(() => purge({ id: file._id }))
                  }}
                >
                  Purger {file.name}
                </RowAction>
              </>
            ) : (
              <RowAction onClick={() => void perform(() => trashFile(file))}>
                Corbeille {file.name}
              </RowAction>
            )}
          </RowActions>
        </div>
      ))}
      {files.status === 'CanLoadMore' && (
        <Button onClick={() => files.loadMore(20)}>Plus de fichiers</Button>
      )}
      {(pending || upload.pending) && <p role="status">Envoi en cours…</p>}
      {(error || upload.error) && <p role="alert">{upload.error ?? error}</p>}
    </section>
  )
}
