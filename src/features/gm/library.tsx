import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import type { GmSheetKind } from '@shared/gm'
import { gmSheetKindLabels, gmSheetKindOf, gmSheetKinds } from '@shared/gm'
import { Link } from '@tanstack/react-router'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { operationErrorMessage } from '@/features/auth/errors'
import { useRetained } from '@/hooks/use-retained'

import { TitleForm } from './title-form'

export function Library({ projectId }: { projectId: string }) {
  const project = useRetained(useQuery(api.gm.getProject, { id: projectId }))
  if (project === undefined)
    return <p role="status">Chargement de la bibliothèque…</p>
  if (!project) return <p role="alert">Projet introuvable ou inaccessible.</p>
  return <LibraryContent project={project} />
}

function LibraryContent({ project }: { project: Doc<'gmProjects'> }) {
  const projectId = project._id
  const [kind, setKind] = useState<GmSheetKind | ''>('')
  const [newKind, setNewKind] = useState<GmSheetKind>('npc')
  const [trashed, setTrashed] = useState(false)
  const [search, setSearch] = useState('')
  const createSheet = useMutation(api.gmSheets.createSheet)
  return (
    <>
      <Link
        to="/app/projects/$projectId"
        params={{ projectId }}
        className="quiet-link"
      >
        ← {project.title}
      </Link>
      <div className="page-heading mt-5">
        <div>
          <p className="eyebrow">BIBLIOTHÈQUE</p>
          <h1>Fiches du projet</h1>
          <p>
            PNJ, monstres, lieux, objets, règles… réutilisables et reliés entre
            eux.
          </p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="grid content-start gap-6">
          <section className="panel grid gap-4 p-5">
            <label htmlFor="new-sheet-kind">Type de la nouvelle fiche</label>
            <select
              id="new-sheet-kind"
              className="rounded border bg-background p-2"
              value={newKind}
              onChange={(event) =>
                setNewKind(gmSheetKindOf(event.target.value) ?? 'npc')
              }
            >
              {gmSheetKinds.map((value) => (
                <option key={value} value={value}>
                  {gmSheetKindLabels[value]}
                </option>
              ))}
            </select>
            <TitleForm
              label="Créer une fiche"
              onCreate={(title) =>
                createSheet({ projectId, kind: newKind, title })
              }
            />
          </section>
          <section className="panel grid gap-3 p-5">
            <label htmlFor="sheet-search">Rechercher une fiche</label>
            <input
              id="sheet-search"
              type="search"
              className="rounded border bg-background p-2"
              value={search}
              maxLength={100}
              onChange={(event) => setSearch(event.target.value)}
            />
            <label htmlFor="sheet-filter">Filtrer par type</label>
            <select
              id="sheet-filter"
              className="rounded border bg-background p-2"
              value={kind}
              disabled={trashed}
              onChange={(event) =>
                setKind(gmSheetKindOf(event.target.value) ?? '')
              }
            >
              <option value="">Tous les types</option>
              {gmSheetKinds.map((value) => (
                <option key={value} value={value}>
                  {gmSheetKindLabels[value]}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              aria-pressed={trashed}
              onClick={() => setTrashed(!trashed)}
            >
              {trashed ? 'Revenir aux fiches' : 'Voir la corbeille'}
            </Button>
          </section>
        </aside>
        <section aria-label="Fiches" className="grid content-start gap-3">
          {search.trim() && !trashed ? (
            <SearchResults projectId={projectId} text={search} />
          ) : (
            <SheetList
              projectId={projectId}
              {...(kind ? { kind } : {})}
              trashed={trashed}
            />
          )}
        </section>
      </div>
    </>
  )
}

function SheetLink({
  sheet,
}: {
  sheet: { _id: Id<'gmSheets'>; title: string; kind: GmSheetKind }
}) {
  return (
    <Link
      to="/app/sheets/$sheetId"
      params={{ sheetId: sheet._id }}
      className="panel block p-4 hover:bg-muted"
    >
      <span className="eyebrow">{gmSheetKindLabels[sheet.kind]}</span>
      <span className="block font-semibold">{sheet.title}</span>
    </Link>
  )
}

function SearchResults({
  projectId,
  text,
}: {
  projectId: Id<'gmProjects'>
  text: string
}) {
  const results = useQuery(api.gmSheets.searchSheets, { projectId, text })
  if (results === undefined) return <p role="status">Recherche…</p>
  if (results.length === 0)
    return <p className="text-muted-foreground">Aucune fiche trouvée.</p>
  return (
    <>
      <h2 className="text-lg font-semibold">Résultats</h2>
      {results.map((sheet) => (
        <SheetLink key={sheet._id} sheet={sheet} />
      ))}
    </>
  )
}

function SheetList({
  projectId,
  kind,
  trashed,
}: {
  projectId: Id<'gmProjects'>
  kind?: GmSheetKind
  trashed: boolean
}) {
  const sheets = usePaginatedQuery(
    api.gmSheets.listSheets,
    { projectId, ...(trashed ? { trashed } : kind ? { kind } : {}) },
    { initialNumItems: 20 }
  )
  return (
    <>
      <h2 className="text-lg font-semibold">
        {trashed ? 'Corbeille' : 'Fiches'}
      </h2>
      {sheets.status === 'LoadingFirstPage' && (
        <p role="status">Chargement des fiches…</p>
      )}
      {sheets.status === 'Exhausted' && sheets.results.length === 0 && (
        <p className="text-muted-foreground">
          {trashed
            ? 'La corbeille est vide.'
            : 'Aucune fiche pour l’instant. Créez votre première fiche.'}
        </p>
      )}
      {sheets.results.map((sheet) =>
        trashed ? (
          <TrashedSheet key={sheet._id} sheet={sheet} />
        ) : (
          <SheetLink key={sheet._id} sheet={sheet} />
        )
      )}
      {sheets.status === 'CanLoadMore' && (
        <Button variant="outline" onClick={() => sheets.loadMore(20)}>
          Plus de fiches
        </Button>
      )}
    </>
  )
}

function TrashedSheet({ sheet }: { sheet: Doc<'gmSheets'> }) {
  const restore = useMutation(api.gmSheets.restoreSheet)
  const erase = useMutation(api.gmSheets.deleteSheetForever)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
    } catch (error_) {
      setError(operationErrorMessage(error_))
    }
  }
  return (
    <div className="panel grid gap-2 p-4">
      <span className="eyebrow">{gmSheetKindLabels[sheet.kind]}</span>
      <span className="font-semibold">{sheet.title}</span>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() => void run(() => restore({ id: sheet._id }))}
        >
          Restaurer « {sheet.title} »
        </Button>
        {confirming ? (
          <Button
            variant="destructive"
            onClick={() => void run(() => erase({ id: sheet._id }))}
          >
            Confirmer l’effacement définitif
          </Button>
        ) : (
          <Button variant="ghost" onClick={() => setConfirming(true)}>
            Effacer définitivement
          </Button>
        )}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
