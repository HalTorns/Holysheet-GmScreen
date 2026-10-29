import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import type { Layout } from '@convex/lib/gmFormats'
import { gmWidgetKinds, gmWidgetLabels } from '@shared/gm'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import { useCallback, useState } from 'react'

import { Button } from '@/components/ui/button'
import { operationErrorMessage } from '@/features/auth/errors'
import { useRetained } from '@/hooks/use-retained'

import { LayoutEditor } from './layout-editor'
import { useScreenWidgets } from './use-screen-widgets'

export function Screen({ screenId }: { screenId: string }) {
  const data = useRetained(useQuery(api.gm.getScreen, { id: screenId }))
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
  const { widgets: notes, pages } = useScreenWidgets(screen._id, layouts)
  const addNote = useMutation(api.gm.addNote)
  const addWidget = useMutation(api.gmWidgets.addWidget)
  const variables = useQuery(api.gmVariables.listVariables, {
    projectId: screen.projectId,
  })
  const [widgetKind, setWidgetKind] = useState<
    | 'checklist'
    | 'counter'
    | 'dice'
    | 'sheet'
    | 'table'
    | 'clock'
    | 'initiative'
  >('checklist')
  const setLocked = useMutation(api.gmEditor.setLayoutLocked)
  const [selected, setSelected] = useState<Id<'gmLayouts'> | null>(null)
  const [readOnly, setReadOnly] = useState(false)
  const [autoSave, setAutoSave] = useState(true)
  const [dirty, setDirty] = useState(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const reportDirty = useCallback((value: boolean) => setDirty(value), [])
  const digital = layouts.filter((layout) => layout.kind === 'digital')
  const layout = digital.find((item) => item._id === selected) ?? digital[0]
  const locked = screen.layoutLocked ?? false
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
  return (
    <>
      <Link
        to="/app/projects/$projectId"
        params={{ projectId: screen.projectId }}
        className="quiet-link"
      >
        ← Retour au projet
      </Link>
      <div className="page-heading mt-5">
        <div>
          <p className="eyebrow">
            SCREEN · {layout?.width} × {layout?.height} px
          </p>
          <h1>{screen.title}</h1>
          <p>
            {readOnly
              ? 'Lecture seule'
              : locked
                ? 'Disposition verrouillée · contenus modifiables'
                : 'Édition · déplacez et redimensionnez vos notes'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={dirty || pending}
            onClick={() => setReadOnly(!readOnly)}
          >
            {readOnly ? 'Reprendre l’édition' : 'Lecture seule'}
          </Button>
          <Button
            variant="outline"
            disabled={readOnly || dirty || pending}
            onClick={() =>
              void perform(() =>
                setLocked({ screenId: screen._id, locked: !locked })
              )
            }
          >
            {locked
              ? 'Déverrouiller la disposition'
              : 'Verrouiller la disposition'}
          </Button>
          <Button
            disabled={readOnly || locked || dirty || pending}
            onClick={() =>
              void perform(() => addNote({ screenId: screen._id }))
            }
          >
            {pending ? 'Patientez…' : 'Ajouter une note'}
          </Button>
        </div>
        <label>
          Type de widget
          <select
            aria-label="Type de widget"
            value={widgetKind}
            disabled={readOnly || locked || dirty || pending}
            onChange={(event) => {
              const kind = gmWidgetKinds.find(
                (entry) => entry === event.target.value
              )
              if (kind && kind !== 'note') setWidgetKind(kind)
            }}
          >
            {gmWidgetKinds
              .filter((kind) => kind !== 'note')
              .map((kind) => (
                <option key={kind} value={kind}>
                  {gmWidgetLabels[kind]}
                </option>
              ))}
          </select>
        </label>
        <Button
          disabled={readOnly || locked || dirty || pending}
          onClick={() =>
            void perform(() =>
              addWidget({ screenId: screen._id, kind: widgetKind })
            )
          }
        >
          Ajouter un widget
        </Button>
      </div>
      <div className="mb-4 flex flex-wrap items-end gap-4 rounded-xl border bg-background p-3">
        <label className="grid gap-1 text-sm">
          Profil de disposition
          <select
            aria-label="Profil de disposition"
            className="rounded border bg-background p-2"
            value={layout?._id ?? ''}
            disabled={dirty || pending}
            onChange={(event) =>
              setSelected(
                digital.find((item) => item._id === event.target.value)?._id ??
                  null
              )
            }
          >
            {digital.map((profile) => (
              <option key={profile._id} value={profile._id}>
                {profile.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={autoSave}
            onChange={(event) => setAutoSave(event.target.checked)}
          />
          Sauvegarde automatique
        </label>
        {dirty && (
          <p role="status" className="text-xs text-muted-foreground">
            Enregistrez les brouillons avant de changer de profil ou de mode.
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="field-error mb-3">
          {error}
        </p>
      )}
      {pages}
      {layout && (
        <LayoutEditor
          key={layout._id}
          layout={layout}
          notes={notes}
          variables={variables?.map((entry) => entry.variable)}
          readOnly={readOnly}
          locked={locked}
          autoSave={autoSave}
          onDirtyChange={reportDirty}
          onProfileCreated={setSelected}
        />
      )}
    </>
  )
}
