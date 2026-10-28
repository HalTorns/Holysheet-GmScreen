import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { Link } from '@tanstack/react-router'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { TitleForm } from './title-form'

export function Project({ projectId }: { projectId: string }) {
  const project = useQuery(api.gm.getProject, { id: projectId })
  if (project === undefined) return <p role="status">Chargement du projet…</p>
  if (!project) return <p role="alert">Projet introuvable ou inaccessible.</p>
  return <ProjectContent project={project} />
}

function ProjectContent({ project }: { project: Doc<'gmProjects'> }) {
  const projectId = project._id
  const [path, setPath] = useState<{ id: Id<'gmFolders'>; title: string }[]>([])
  const [format, setFormat] = useState<'digital' | 'a4-landscape'>('digital')
  const parentId = path.at(-1)?.id
  const folder = parentId ? { parentId } : {}
  const screenFolder = parentId ? { folderId: parentId } : {}
  const folders = usePaginatedQuery(
    api.gm.listFolders,
    { projectId, ...folder },
    { initialNumItems: 20 }
  )
  const screens = usePaginatedQuery(
    api.gm.listScreens,
    { projectId, ...screenFolder },
    { initialNumItems: 20 }
  )
  const createFolder = useMutation(api.gm.createFolder)
  const createScreen = useMutation(api.gm.createScreen)
  return (
    <>
      <Link to="/app" className="quiet-link">
        ← Mes projets
      </Link>
      <div className="page-heading mt-5">
        <div>
          <p className="eyebrow">CAMPAGNE</p>
          <h1>{project.title}</h1>
          <p>
            Organisez vos références et préparez les Screens de votre prochaine
            partie.
          </p>
        </div>
        <Link
          to="/app/projects/$projectId/library"
          params={{ projectId }}
          className="quiet-link"
        >
          Bibliothèque de fiches →
        </Link>
        <Link
          to="/app/projects/$projectId/variables"
          params={{ projectId }}
          className="quiet-link"
        >
          Variables →
        </Link>
      </div>
      <nav
        aria-label="Dossier courant"
        className="mb-6 flex flex-wrap items-center gap-2"
      >
        <Button variant="ghost" onClick={() => setPath([])}>
          Racine
        </Button>
        {path.map((item, index) => (
          <Button
            key={item.id}
            variant="ghost"
            onClick={() => setPath(path.slice(0, index + 1))}
          >
            / {item.title}
          </Button>
        ))}
      </nav>
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <aside className="grid content-start gap-6">
          <section className="panel p-5">
            <TitleForm
              label="Créer un dossier"
              onCreate={(title) =>
                createFolder({ projectId, title, ...folder })
              }
            />
          </section>
          <section className="panel grid gap-4 p-5">
            <label htmlFor="screen-format">Format initial du Screen</label>
            <select
              id="screen-format"
              className="rounded border bg-background p-2"
              value={format}
              onChange={(event) =>
                setFormat(
                  event.target.value === 'digital' ? 'digital' : 'a4-landscape'
                )
              }
            >
              <option value="digital">Numérique · 1920 × 1080 px</option>
              <option value="a4-landscape">A4 paysage · 297 × 210 mm</option>
            </select>
            <TitleForm
              label="Créer un Screen"
              onCreate={(title) =>
                createScreen({ projectId, title, format, ...screenFolder })
              }
            />
          </section>
        </aside>
        <section
          aria-label="Contenu du dossier"
          className="grid content-start gap-4"
        >
          <h2 className="text-lg font-semibold">Dossiers</h2>
          {folders.status === 'LoadingFirstPage' && (
            <p role="status">Chargement des dossiers…</p>
          )}
          {folders.results.map((item) => (
            <Button
              variant="outline"
              key={item._id}
              className="justify-start"
              onClick={() =>
                setPath([...path, { id: item._id, title: item.title }])
              }
            >
              Dossier · {item.title}
            </Button>
          ))}
          {folders.status === 'CanLoadMore' && (
            <Button variant="outline" onClick={() => folders.loadMore(20)}>
              Plus de dossiers
            </Button>
          )}
          <h2 className="mt-5 text-lg font-semibold">Screens</h2>
          {screens.status === 'LoadingFirstPage' && (
            <p role="status">Chargement des Screens…</p>
          )}
          {screens.status === 'Exhausted' && screens.results.length === 0 && (
            <p className="text-muted-foreground">
              Aucun Screen dans ce dossier. Créez-en un pour y ajouter vos
              premières notes.
            </p>
          )}
          {screens.results.map((item) => (
            <Link
              key={item._id}
              to="/app/screens/$screenId"
              params={{ screenId: item._id }}
              className="panel p-5 font-semibold hover:border-primary"
            >
              {item.title} →
            </Link>
          ))}
          {screens.status === 'CanLoadMore' && (
            <Button variant="outline" onClick={() => screens.loadMore(20)}>
              Plus de Screens
            </Button>
          )}
        </section>
      </div>
    </>
  )
}
