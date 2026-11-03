import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { Link } from '@tanstack/react-router'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { Settings } from 'lucide-react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Menu, MenuContent, MenuItem, MenuTrigger } from '@/components/ui/menu'
import { SidePanel } from '@/components/ui/side-panel'
import { useRetained } from '@/hooks/use-retained'

import { CustomWidgets } from './custom-widgets'
import { Files } from './files'
import { CreateMenu, ProjectNav } from './page-actions'
import { TitleForm } from './title-form'

export function Project({ projectId }: { projectId: string }) {
  const project = useRetained(useQuery(api.gm.getProject, { id: projectId }))
  if (project === undefined) return <p role="status">Chargement du projet…</p>
  if (!project) return <p role="alert">Projet introuvable ou inaccessible.</p>
  return <ProjectContent project={project} />
}

function ProjectContent({ project }: { project: Doc<'gmProjects'> }) {
  const projectId = project._id
  const [path, setPath] = useState<{ id: Id<'gmFolders'>; title: string }[]>([])
  const [format, setFormat] = useState<'digital' | 'a4-landscape'>('digital')
  const [drawer, setDrawer] = useState<'files' | 'custom' | null>(null)
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
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <p className="eyebrow">CAMPAGNE</p>
          <h1 className="truncate">{project.title}</h1>
        </div>
        <CreateMenu
          choices={[
            { value: 'folder', label: 'Dossier…', title: 'Nouveau dossier' },
            { value: 'screen', label: 'Screen…', title: 'Nouveau Screen' },
          ]}
          render={(choice, close) =>
            choice === 'folder' ? (
              <TitleForm
                label="Créer un dossier"
                onCreate={async (title) => {
                  await createFolder({ projectId, title, ...folder })
                  close()
                }}
              />
            ) : (
              <div className="grid gap-4">
                <label htmlFor="screen-format">Format initial du Screen</label>
                <select
                  id="screen-format"
                  className="rounded border bg-background p-2"
                  value={format}
                  onChange={(event) =>
                    setFormat(
                      event.target.value === 'digital'
                        ? 'digital'
                        : 'a4-landscape'
                    )
                  }
                >
                  <option value="digital">Numérique · 1920 × 1080 px</option>
                  <option value="a4-landscape">
                    A4 paysage · 297 × 210 mm
                  </option>
                </select>
                <TitleForm
                  label="Créer un Screen"
                  onCreate={async (title) => {
                    await createScreen({
                      projectId,
                      title,
                      format,
                      ...screenFolder,
                    })
                    close()
                  }}
                />
              </div>
            )
          }
        />
        <Menu>
          <MenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="outline"
                title="Ressources du projet"
              />
            }
            aria-label="Ressources du projet"
          >
            <Settings />
          </MenuTrigger>
          <MenuContent align="end">
            <MenuItem onClick={() => setDrawer('files')}>
              Fichiers du projet…
            </MenuItem>
            <MenuItem onClick={() => setDrawer('custom')}>
              Widgets personnalisés…
            </MenuItem>
          </MenuContent>
        </Menu>
      </div>
      <ProjectNav projectId={projectId} />
      <SidePanel
        open={drawer === 'files'}
        side="left"
        title="Fichiers du projet"
        // Un import en cours garde son statut et son erreur une fois refermé.
        keepMounted
        onClose={() => setDrawer(null)}
      >
        <Files projectId={projectId} />
      </SidePanel>
      <SidePanel
        open={drawer === 'custom'}
        side="left"
        title="Widgets personnalisés"
        // L'éditeur de définition garde son brouillon quand on referme.
        keepMounted
        onClose={() => setDrawer(null)}
      >
        <CustomWidgets projectId={projectId} />
      </SidePanel>
      <nav
        aria-label="Dossier courant"
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <Button variant="ghost" size="sm" onClick={() => setPath([])}>
          Racine
        </Button>
        {path.map((item, index) => (
          <Button
            key={item.id}
            variant="ghost"
            size="sm"
            onClick={() => setPath(path.slice(0, index + 1))}
          >
            / {item.title}
          </Button>
        ))}
      </nav>
      <div>
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
