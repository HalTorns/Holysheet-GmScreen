import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import type { Layout } from '@convex/lib/gmFormats'
import { gmWidgetLabels } from '@shared/gm'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { Plus, Settings } from 'lucide-react'
import { Fragment, useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuTrigger,
} from '@/components/ui/menu'
import { SidePanel } from '@/components/ui/side-panel'
import { operationErrorMessage } from '@/features/auth/errors'
import { useResilientQuery } from '@/hooks/use-resilient-query'

import { CustomWidgets } from './custom-widgets'
import { useFileUpload } from './file-upload'
import { Files } from './files'
import { LayoutEditor, shortcuts } from './layout-editor'
import type { EditorDialog, ScreenMode } from './layout-editor'
import { useScreenWidgets } from './use-screen-widgets'

const widgetFamilies = [
  ['Texte et listes', ['checklist', 'table', 'sheet']],
  ['Outils de partie', ['counter', 'dice', 'clock', 'initiative']],
  ['Médias et liens', ['image', 'pdf', 'embed']],
] as const

export function Screen({ screenId }: { screenId: string }) {
  const data = useResilientQuery(api.gm.getScreen, { id: screenId })
  if (data === undefined) return <p role="status">Chargement du Screen…</p>
  if (!data) return <p role="alert">Screen introuvable ou inaccessible.</p>
  return <ScreenWorkspace key={data.screen._id} {...data} />
}

function ScreenWorkspace({
  screen,
  layouts,
}: {
  screen: Doc<'gmScreens'>
  layouts: Layout[]
}) {
  const notes = useScreenWidgets(screen._id)
  const addNote = useMutation(api.gm.addNote)
  const upload = useFileUpload(screen.projectId)
  const placeFile = useMutation(api.gmFiles.placeFile)
  const placeCustom = useMutation(api.customWidgets.place)
  const addWidget = useMutation(api.gmWidgets.addWidget)
  const variables = useQuery(api.gmVariables.listVariables, {
    projectId: screen.projectId,
  })
  const setLocked = useMutation(api.gmEditor.setLayoutLocked)
  const [selected, setSelected] = useState<Id<'gmLayouts'> | null>(null)
  const [mode, setMode] = useState<ScreenMode>('edit')
  const [grid, setGrid] = useState(false)
  const [dialog, setDialog] = useState<EditorDialog | null>(null)
  const [drawer, setDrawer] = useState<'files' | 'custom' | null>(null)
  const [toolbar, setToolbar] = useState<HTMLElement | null>(null)
  const [autoSave, setAutoSave] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reportDirty = useCallback((value: boolean) => setDirty(value), [])
  const digital = layouts.filter((layout) => layout.kind === 'digital')
  const layout = digital.find((item) => item._id === selected) ?? digital[0]
  const locked = screen.layoutLocked ?? false
  const adding = mode !== 'edit' || locked || dirty || pending
  async function perform(action: () => Promise<unknown>) {
    setPending(true)
    setError(null)
    try {
      await action()
    } catch (error) {
      setError(operationErrorMessage(error))
    } finally {
      setPending(false)
    }
  }
  async function importImage(file: File) {
    if (adding || upload.pending) return
    await perform(async () => {
      const result = await upload.upload(file)
      await placeFile({ screenId: screen._id, fileId: result.id })
    })
  }
  return (
    <div
      onPaste={(event) => {
        const target = event.target
        if (
          target instanceof HTMLElement &&
          target.closest('input, textarea, [contenteditable="true"]')
        )
          return
        const file = [...event.clipboardData.files].find((entry) =>
          entry.type.startsWith('image/')
        )
        if (file) {
          event.preventDefault()
          void importImage(file)
        }
      }}
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) event.preventDefault()
      }}
      onDrop={(event) => {
        const file = [...event.dataTransfer.files].find((entry) =>
          entry.type.startsWith('image/')
        )
        if (file) {
          event.preventDefault()
          void importImage(file)
        }
      }}
    >
      <Link
        to="/app/projects/$projectId"
        params={{ projectId: screen.projectId }}
        className="quiet-link"
      >
        ← Retour au projet
      </Link>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="mr-auto min-w-0">
          <p className="eyebrow">
            SCREEN · {layout?.width} × {layout?.height} px · {layout?.name}
          </p>
          <h1 className="truncate">{screen.title}</h1>
        </div>
        <div
          role="radiogroup"
          aria-label="Mode du Screen"
          className="flex rounded-lg border border-border p-0.5"
        >
          {(
            [
              ['edit', 'Édition', 'Disposer et configurer les widgets'],
              ['play', 'Jeu', 'Utiliser les widgets sans les déplacer'],
              ['read', 'Lecture', 'Consulter sans rien modifier'],
            ] as const
          ).map(([value, label, hint]) => (
            <Button
              key={value}
              role="radio"
              size="sm"
              variant={mode === value ? 'secondary' : 'ghost'}
              aria-checked={mode === value}
              title={hint}
              disabled={dirty || pending}
              onClick={() => setMode(value)}
            >
              {label}
            </Button>
          ))}
        </div>
        {locked && (
          <span className="rounded-full border border-border px-2 py-0.5 text-xs">
            Disposition verrouillée
          </span>
        )}
        {mode === 'edit' && (
          <>
            <Menu>
              <MenuTrigger
                render={<Button size="sm" title="Ajouter un widget" />}
                disabled={adding}
              >
                <Plus />
                Ajouter
              </MenuTrigger>
              <MenuContent>
                <MenuItem
                  onClick={() =>
                    void perform(() => addNote({ screenId: screen._id }))
                  }
                >
                  Note
                </MenuItem>
                {widgetFamilies.map(([family, kinds]) => (
                  <MenuSub key={family} label={family}>
                    {kinds.map((kind) => (
                      <MenuItem
                        key={kind}
                        onClick={() =>
                          void perform(() =>
                            addWidget({ screenId: screen._id, kind })
                          )
                        }
                      >
                        {gmWidgetLabels[kind]}
                      </MenuItem>
                    ))}
                  </MenuSub>
                ))}
                <MenuSeparator />
                <MenuItem onClick={() => setDrawer('files')}>
                  Image ou fichier…
                </MenuItem>
                <MenuItem onClick={() => setDrawer('custom')}>
                  Widget personnalisé…
                </MenuItem>
              </MenuContent>
            </Menu>
            <div ref={setToolbar} className="contents" />
            <Menu>
              <MenuTrigger
                render={
                  <Button
                    size="icon-sm"
                    variant="outline"
                    title="Réglages du Screen"
                  />
                }
                aria-label="Réglages du Screen"
              >
                <Settings />
              </MenuTrigger>
              <MenuContent align="end">
                <MenuSub
                  label="Profil de disposition"
                  disabled={dirty || pending}
                >
                  <MenuRadioGroup
                    value={layout?._id ?? ''}
                    onValueChange={(value: string) =>
                      setSelected(
                        digital.find((item) => item._id === value)?._id ?? null
                      )
                    }
                  >
                    {digital.map((profile) => (
                      <MenuRadioItem key={profile._id} value={profile._id}>
                        {profile.name}
                      </MenuRadioItem>
                    ))}
                  </MenuRadioGroup>
                  <MenuSeparator />
                  <MenuItem
                    disabled={locked}
                    onClick={() => setDialog('settings')}
                  >
                    Configurer le profil…
                  </MenuItem>
                  <MenuItem
                    disabled={locked}
                    onClick={() => setDialog('profile')}
                  >
                    Nouveau profil…
                  </MenuItem>
                </MenuSub>
                <MenuCheckboxItem
                  checked={locked}
                  disabled={dirty || pending}
                  onCheckedChange={(value) =>
                    void perform(() =>
                      setLocked({ screenId: screen._id, locked: value })
                    )
                  }
                >
                  Verrouiller la disposition
                </MenuCheckboxItem>
                <MenuCheckboxItem
                  checked={autoSave}
                  onCheckedChange={setAutoSave}
                >
                  Sauvegarde automatique
                </MenuCheckboxItem>
                <MenuCheckboxItem checked={grid} onCheckedChange={setGrid}>
                  Grille magnétique (8 px)
                </MenuCheckboxItem>
                <MenuSeparator />
                <MenuItem onClick={() => setDialog('goto')}>
                  Aller au widget…
                </MenuItem>
                <MenuItem onClick={() => setDialog('history')}>
                  Historique de la disposition…
                </MenuItem>
                <MenuItem onClick={() => setDrawer('files')}>
                  Fichiers du projet…
                </MenuItem>
                <MenuItem onClick={() => setDrawer('custom')}>
                  Widgets personnalisés…
                </MenuItem>
                <MenuItem onClick={() => setDialog('trash')}>
                  Corbeille du Screen…
                </MenuItem>
                <MenuSeparator />
                <MenuItem shortcut="?" onClick={() => setDialog('shortcuts')}>
                  Raccourcis clavier…
                </MenuItem>
              </MenuContent>
            </Menu>
          </>
        )}
      </div>
      {dirty && (
        <p role="status" className="mt-1 text-xs text-muted-foreground">
          Enregistrez les brouillons avant de changer de profil ou de mode.
        </p>
      )}
      <SidePanel
        open={drawer === 'files' && mode === 'edit'}
        side="left"
        title="Fichiers du projet"
        onClose={() => setDrawer(null)}
      >
        <Files
          projectId={screen.projectId}
          onChoose={
            adding
              ? undefined
              : (file) => placeFile({ screenId: screen._id, fileId: file._id })
          }
        />
      </SidePanel>
      <SidePanel
        open={drawer === 'custom' && mode === 'edit'}
        side="left"
        title="Widgets personnalisés"
        onClose={() => setDrawer(null)}
      >
        <CustomWidgets
          projectId={screen.projectId}
          onChoose={
            adding
              ? undefined
              : (definitionId) =>
                  placeCustom({ screenId: screen._id, definitionId })
          }
        />
      </SidePanel>
      <Dialog
        open={dialog === 'shortcuts'}
        onOpenChange={(open) => setDialog(open ? 'shortcuts' : null)}
      >
        <DialogContent>
          <DialogTitle>Raccourcis clavier</DialogTitle>
          <DialogDescription>
            Actifs en mode Édition, hors champs de saisie.
          </DialogDescription>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
            {shortcuts.map(([keys, action]) => (
              <Fragment key={keys}>
                <dt>
                  <kbd>{keys}</kbd>
                </dt>
                <dd>{action}</dd>
              </Fragment>
            ))}
          </dl>
        </DialogContent>
      </Dialog>
      {upload.pending && <p role="status">Envoi en cours…</p>}
      {upload.error && <p role="alert">{upload.error}</p>}
      {error && (
        <p role="alert" className="field-error mb-3">
          {error}
        </p>
      )}
      {layout && (
        <LayoutEditor
          key={layout._id}
          layout={layout}
          notes={notes}
          variables={variables?.map((entry) => entry.variable)}
          mode={mode}
          locked={locked}
          autoSave={autoSave}
          grid={grid}
          dialog={dialog}
          toolbarSlot={toolbar}
          onDialogChange={setDialog}
          onDirtyChange={reportDirty}
          onProfileCreated={setSelected}
        />
      )}
    </div>
  )
}
