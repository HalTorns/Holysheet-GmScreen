import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { customDefinition } from '@shared/custom-widget-protocol'
import { useMutation, usePaginatedQuery } from 'convex/react'
import { useState } from 'react'

import { DraftGuard } from '@/components/draft-guard'
import { Button } from '@/components/ui/button'
import { operationErrorMessage } from '@/features/auth/errors'

import { CustomFrame } from './custom-frame'

const empty = {
  name: '',
  html: '<button id="count">Compter</button><output id="value">0</output>',
  css: 'body { font-family: sans-serif; }',
  source:
    'const button = document.getElementById("count");\nconst render = () => { document.getElementById("value").textContent = String(widget.state.count || 0); };\nbutton.onclick = () => { widget.setState({count: (widget.state.count || 0) + 1}); render(); };\nwidget.onUpdate(render); render();',
  language: 'js' as const,
  compiled: '',
}
export function CustomWidgets({
  projectId,
  onChoose,
}: {
  projectId: Id<'gmProjects'>
  onChoose?:
    | ((definitionId: Id<'gmCustomWidgets'>) => Promise<unknown>)
    | undefined
}) {
  const [trash, setTrash] = useState(false)
  const [editing, setEditing] = useState<Doc<'gmCustomWidgets'> | 'new' | null>(
    null
  )
  const [error, setError] = useState('')
  const rows = usePaginatedQuery(
    api.customWidgets.list,
    { projectId, trash },
    { initialNumItems: 10 }
  )
  const setTrashed = useMutation(api.customWidgets.setTrashed)
  const purge = useMutation(api.customWidgets.purge)
  const perform = async (operation: () => Promise<unknown>) => {
    setError('')
    try {
      await operation()
    } catch (error_) {
      setError(operationErrorMessage(error_))
    }
  }
  return (
    <section
      aria-label="Widgets personnalisés"
      className="panel my-4 grid gap-3 p-4"
    >
      <h2>Widgets personnalisés</h2>
      <Button onClick={() => setEditing('new')}>
        Créer un widget personnalisé
      </Button>
      <Button onClick={() => setTrash(!trash)}>
        {trash
          ? 'Bibliothèque des widgets'
          : 'Corbeille des widgets personnalisés'}
      </Button>
      {rows.results.map((row) => (
        <div key={row._id}>
          <span>{row.name}</span>
          {!trash && (
            <Button onClick={() => setEditing(row)}>Modifier {row.name}</Button>
          )}
          {!trash && onChoose && (
            <Button onClick={() => void perform(() => onChoose(row._id))}>
              Placer {row.name}
            </Button>
          )}
          <Button
            onClick={() =>
              void perform(() =>
                setTrashed({
                  id: row._id,
                  expectedVersion: row.version,
                  trashed: !trash,
                })
              )
            }
          >
            {trash ? 'Restaurer' : 'Corbeille'} {row.name}
          </Button>
          {trash && (
            <Button
              onClick={() => {
                if (window.confirm('Purger définitivement cette définition ?'))
                  void perform(() =>
                    purge({ id: row._id, expectedVersion: row.version })
                  )
              }}
            >
              Purger {row.name}
            </Button>
          )}
        </div>
      ))}
      {rows.status === 'CanLoadMore' && (
        <Button onClick={() => rows.loadMore(10)}>
          Plus de widgets personnalisés
        </Button>
      )}
      {editing && (
        <DefinitionEditor
          key={editing === 'new' ? 'new' : `${editing._id}:${editing.version}`}
          projectId={projectId}
          definition={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  )
}
function DefinitionEditor({
  projectId,
  definition,
  onClose,
}: {
  projectId: Id<'gmProjects'>
  definition: Doc<'gmCustomWidgets'> | undefined
  onClose: () => void
}) {
  const [draft, setDraft] = useState(
    definition
      ? {
          name: definition.name,
          html: definition.html,
          css: definition.css,
          source: definition.source,
          compiled: definition.compiled,
          language: definition.language,
        }
      : empty
  )
  const [preview, setPreview] = useState<{
    html: string
    css: string
    js: string
    serial: number
  } | null>(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [saved, setSaved] = useState<{
    id: Id<'gmCustomWidgets'>
    version: number
  } | null>(
    definition ? { id: definition._id, version: definition.version } : null
  )
  const save = useMutation(api.customWidgets.save)
  async function compile(persist: boolean) {
    setPending(true)
    setError('')
    try {
      const compiled =
        draft.language === 'ts'
          ? (await import('sucrase')).transform(draft.source, {
              transforms: ['typescript'],
              disableESTransforms: true,
            }).code
          : draft.source
      const parsed = customDefinition.safeParse({ ...draft, compiled })
      if (!parsed.success)
        throw new Error('Définition trop volumineuse ou invalide')
      setPreview({
        html: draft.html,
        css: draft.css,
        js: compiled,
        serial: (preview?.serial ?? 0) + 1,
      })
      if (persist) {
        const id = await save({
          ...parsed.data,
          projectId,
          ...(saved ? { id: saved.id } : {}),
          expectedVersion: saved?.version ?? 0,
        })
        setSaved({ id, version: saved ? saved.version + 1 : 0 })
        setDirty(false)
      }
    } catch (error_) {
      setError(
        error_ instanceof Error
          ? error_.message.slice(0, 500)
          : operationErrorMessage(error_)
      )
    } finally {
      setPending(false)
    }
  }
  return (
    <div aria-label="Éditeur de widget personnalisé">
      <DraftGuard dirty={dirty} />
      <label>
        Nom du widget personnalisé
        <input
          value={draft.name}
          onChange={(event) => {
            setDraft({ ...draft, name: event.target.value })
            setDirty(true)
          }}
        />
      </label>
      <label>
        Langage
        <select
          aria-label="Langage"
          value={draft.language}
          onChange={(event) => {
            setDraft({
              ...draft,
              language: event.target.value === 'ts' ? 'ts' : 'js',
            })
            setDirty(true)
          }}
        >
          <option value="js">JavaScript</option>
          <option value="ts">TypeScript</option>
        </select>
      </label>
      {(['html', 'css', 'source'] as const).map((field) => (
        <label key={field}>
          {field === 'source' ? 'Code JS/TS' : field.toUpperCase()}
          <textarea
            // Imbriquée dans son label, la zone ajouterait son contenu au nom.
            aria-label={field === 'source' ? 'Code JS/TS' : field.toUpperCase()}
            className="min-h-32 w-full font-mono"
            value={draft[field]}
            onChange={(event) => {
              setDraft({ ...draft, [field]: event.target.value })
              setDirty(true)
            }}
          />
        </label>
      ))}
      <Button disabled={pending} onClick={() => void compile(false)}>
        Actualiser l’aperçu
      </Button>
      <Button disabled={pending} onClick={() => void compile(true)}>
        Enregistrer la définition
      </Button>
      <Button
        disabled={pending}
        onClick={() => {
          if (!dirty || window.confirm('Abandonner le brouillon ?')) onClose()
        }}
      >
        Fermer l’éditeur
      </Button>
      {error && <p role="alert">{error}</p>}
      {preview && (
        <CustomFrame
          key={preview.serial}
          input={{
            type: 'init',
            html: preview.html,
            css: preview.css,
            js: preview.js,
            settings: {},
            state: {},
            mode: 'preview',
            theme: 'light',
          }}
        />
      )}
    </div>
  )
}
