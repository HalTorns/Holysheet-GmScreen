import { api } from '@convex/_generated/api'
import { Link } from '@tanstack/react-router'
import { useMutation, usePaginatedQuery } from 'convex/react'
import { FolderOpen } from 'lucide-react'

import { Button } from '@/components/ui/button'

import { TitleForm } from './title-form'

export function Projects() {
  const create = useMutation(api.gm.createProject)
  const { results, status, loadMore } = usePaginatedQuery(
    api.gm.listProjects,
    {},
    { initialNumItems: 12 }
  )
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">VOTRE ESPACE DE MJ</p>
          <h1>Mes projets.</h1>
          <p>
            Une campagne, ses références et vos Screens, réunis au même endroit.
          </p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[18rem_1fr]">
        <section className="panel h-fit p-6" aria-label="Créer un projet">
          <TitleForm
            label="Créer un projet"
            onCreate={(title) => create({ title })}
          />
        </section>
        <section
          aria-label="Mes projets"
          className="grid content-start gap-4 sm:grid-cols-2"
        >
          {status === 'LoadingFirstPage' && (
            <p role="status">Chargement des projets…</p>
          )}
          {status === 'Exhausted' && results.length === 0 && (
            <p>
              Votre première aventure commence ici. Créez un projet pour
              préparer vos Screens.
            </p>
          )}
          {results.map((project) => (
            <Link
              key={project._id}
              to="/app/projects/$projectId"
              params={{ projectId: project._id }}
              className="panel grid gap-3 p-6 transition-colors hover:border-primary"
            >
              <FolderOpen aria-hidden="true" className="text-primary" />
              <h2 className="font-semibold">{project.title}</h2>
              <p className="text-sm text-muted-foreground">
                Ouvrir le projet →
              </p>
            </Link>
          ))}
          {status === 'CanLoadMore' && (
            <Button variant="outline" onClick={() => loadMore(12)}>
              Voir plus de projets
            </Button>
          )}
        </section>
      </div>
    </>
  )
}
