import { api } from '@convex/_generated/api'
import type { Doc } from '@convex/_generated/dataModel'
import type { Widget } from '@convex/lib/gmFormats'
import { rollDice } from '@shared/dice'
import { gmWidgetLabels } from '@shared/gm'
import { Link } from '@tanstack/react-router'
import { useMutation } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { DraftGuard } from '@/components/draft-guard'
import { Button } from '@/components/ui/button'
import {
  AuthOperationError,
  operationErrorMessage,
} from '@/features/auth/errors'

import { NoteEditor } from './note-editor'
import { RevisionHistory } from './revision-history'
import { useEditorDraft } from './use-editor-draft'

type Variables = Doc<'gmVariables'>[]
type TypedWidget = Exclude<Widget, { kind: 'note' }>
type Props = {
  note: Widget
  variables: Variables | undefined
  index: number
  readOnly: boolean
  locked: boolean
  autoSave: boolean
  onDirtyChange: (id: string, dirty: boolean) => void
}
function counterSource(
  widget: Extract<Widget, { kind: 'counter' }>,
  variables: Variables | undefined
) {
  const source = widget.config.source
  if (source.type === 'local')
    return {
      ...source,
      value: 'value' in widget.state ? widget.state.value : 0,
      name: 'Compteur autonome',
    }
  const variable = variables?.find(
    (item) => item._id === source.variableId && item.type === 'number'
  )
  if (!variable || variable.type !== 'number') return null
  return {
    value: variable.value,
    min: variable.min,
    max: variable.max,
    name: variable.label || variable.name,
    step: source.step,
  }
}
function WidgetStatic({
  widget,
  variables,
}: {
  widget: TypedWidget
  variables: Variables | undefined
}) {
  if (widget.kind === 'checklist')
    return (
      <ul>
        {widget.config.items.map((item) => (
          <li key={item.id}>
            {widget.state.checkedIds.includes(item.id) ? '☑' : '☐'} {item.label}
          </li>
        ))}
      </ul>
    )
  if (widget.kind === 'counter')
    return (
      <p>
        {counterSource(widget, variables)?.value ?? 'Variable indisponible'}
      </p>
    )
  return <p>{widget.config.expression} · Résultat indisponible</p>
}
export function WidgetContent(props: Props) {
  const { note, variables } = props
  if (note.kind === 'note') return <NoteEditor {...props} />
  if (props.readOnly)
    return (
      <div>
        <h3>{note.config.title || gmWidgetLabels[note.kind]}</h3>
        <WidgetStatic widget={note} variables={variables} />
      </div>
    )
  return <TypedWidgetEditor {...props} widget={note} />
}
function TypedWidgetEditor({
  widget,
  variables,
  readOnly,
  locked,
  autoSave,
  onDirtyChange,
}: Props & { widget: TypedWidget }) {
  const update = useMutation(api.gmWidgets.updateWidget)
  const setItem = useMutation(api.gmWidgets.setChecklistItem)
  const setCounter = useMutation(api.gmWidgets.setCounterValue)
  const setVariable = useMutation(api.gmVariables.setVariableValue)
  const persist = useCallback(
    (value: TypedWidget, expectedVersion: number) => {
      if (value.kind === 'checklist')
        return update({
          id: widget._id,
          expectedVersion,
          widget: {
            kind: value.kind,
            config: value.config,
            state: value.state,
          },
        })
      if (value.kind === 'counter')
        return update({
          id: widget._id,
          expectedVersion,
          widget: {
            kind: value.kind,
            config: value.config,
            state: value.state,
          },
        })
      return update({
        id: widget._id,
        expectedVersion,
        widget: { kind: value.kind, config: value.config, state: value.state },
      })
    },
    [update, widget._id]
  )
  const editor = useEditorDraft({
    value: widget,
    version: widget.version,
    onSave: persist,
    autoSave,
    paused: locked || readOnly,
  })
  const [pending, setPending] = useState(false)
  const inFlight = useRef(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<ReturnType<typeof rollDice> | null>(null)
  const [linkTarget, setLinkTarget] = useState('')
  const [localValue, setLocalValue] = useState('')
  const [valueInput, setValueInput] = useState<string | null>(null)
  const dirty = editor.dirty || editor.pending || pending
  useEffect(() => {
    onDirtyChange(widget._id, dirty)
  }, [widget._id, dirty, onDirtyChange])
  useEffect(
    () => () => onDirtyChange(widget._id, false),
    [widget._id, onDirtyChange]
  )
  const current = editor.value
  const title = current.config.title || gmWidgetLabels[current.kind]
  const blocked = readOnly || pending || editor.pending || editor.dirty
  async function perform(action: () => Promise<unknown>) {
    if (inFlight.current) return
    inFlight.current = true
    setPending(true)
    setError(null)
    try {
      await action()
    } catch (error_) {
      setError(operationErrorMessage(error_))
    } finally {
      inFlight.current = false
      setPending(false)
    }
  }
  function editTitle(value: string) {
    if (current.kind === 'checklist')
      editor.edit({ ...current, config: { ...current.config, title: value } })
    else if (current.kind === 'counter')
      editor.edit({ ...current, config: { ...current.config, title: value } })
    else
      editor.edit({ ...current, config: { ...current.config, title: value } })
  }
  function moveItem(id: string, direction: number) {
    if (current.kind !== 'checklist') return
    const items = [...current.config.items]
    const index = items.findIndex((item) => item.id === id)
    const item = items[index]
    if (!item || index + direction < 0 || index + direction >= items.length)
      return
    items.splice(index, 1)
    items.splice(index + direction, 0, item)
    editor.edit({ ...current, config: { ...current.config, items } })
    requestAnimationFrame(() =>
      document
        .querySelector<HTMLInputElement>(`#item-label-${widget._id}-${id}`)
        ?.focus()
    )
  }
  const source =
    current.kind === 'counter' ? counterSource(current, variables) : null
  function writeCounter(value: number) {
    if (current.kind !== 'counter') return Promise.resolve()
    if (!Number.isFinite(value))
      return Promise.reject(new AuthOperationError('INVALID_NUMBER'))
    if (
      source &&
      ((source.min !== undefined && value < source.min) ||
        (source.max !== undefined && value > source.max))
    )
      return Promise.reject(new AuthOperationError('OUT_OF_RANGE'))
    if (current.config.source.type === 'variable')
      return setVariable({ id: current.config.source.variableId, value })
    return setCounter({
      id: widget._id,
      expectedVersion: widget.version,
      value,
    })
  }
  return (
    <div
      className="flex h-full flex-col gap-2 overflow-auto"
      aria-label={title}
    >
      <DraftGuard dirty={editor.dirty} />
      <label>
        Titre du widget
        <input
          aria-label="Titre du widget"
          value={current.config.title}
          maxLength={120}
          disabled={locked || pending || readOnly}
          onChange={(event) => editTitle(event.target.value)}
        />
      </label>
      {current.kind === 'checklist' && (
        <>
          <ul>
            {current.config.items.map((item, index) => (
              <li key={item.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={current.state.checkedIds.includes(item.id)}
                    disabled={blocked}
                    onChange={(event) =>
                      void perform(() =>
                        setItem({
                          id: widget._id,
                          expectedVersion: widget.version,
                          itemId: item.id,
                          checked: event.target.checked,
                        })
                      )
                    }
                  />
                  {item.label}
                </label>
                <input
                  id={`item-label-${widget._id}-${item.id}`}
                  aria-label={`Libellé ${index + 1}`}
                  value={item.label}
                  maxLength={80}
                  disabled={locked || pending}
                  onChange={(event) =>
                    editor.edit({
                      ...current,
                      config: {
                        ...current.config,
                        items: current.config.items.map((entry) =>
                          entry.id === item.id
                            ? { ...entry, label: event.target.value }
                            : entry
                        ),
                      },
                    })
                  }
                />
                <Button
                  disabled={locked || pending || index === 0}
                  onClick={() => moveItem(item.id, -1)}
                >
                  Monter {item.label}
                </Button>
                <Button
                  disabled={
                    locked ||
                    pending ||
                    index === current.config.items.length - 1
                  }
                  onClick={() => moveItem(item.id, 1)}
                >
                  Descendre {item.label}
                </Button>
                <Button
                  disabled={locked || pending}
                  onClick={() => {
                    editor.edit({
                      ...current,
                      config: {
                        ...current.config,
                        items: current.config.items.filter(
                          (entry) => entry.id !== item.id
                        ),
                      },
                      state: {
                        checkedIds: current.state.checkedIds.filter(
                          (id) => id !== item.id
                        ),
                      },
                    })
                    requestAnimationFrame(() =>
                      document
                        .querySelector<HTMLButtonElement>(
                          `#add-item-${widget._id}`
                        )
                        ?.focus()
                    )
                  }}
                >
                  Supprimer {item.label}
                </Button>
              </li>
            ))}
          </ul>
          <Button
            id={`add-item-${widget._id}`}
            disabled={locked || pending || current.config.items.length >= 40}
            onClick={() => {
              const ids = new Set(current.config.items.map((item) => item.id))
              let serial = 1
              while (ids.has(`item-${serial}`)) serial++
              editor.edit({
                ...current,
                config: {
                  ...current.config,
                  items: [
                    ...current.config.items,
                    { id: `item-${serial}`, label: `Élément ${serial}` },
                  ],
                },
              })
            }}
          >
            Ajouter un élément
          </Button>
        </>
      )}
      {current.kind === 'counter' && (
        <>
          <p>
            {source?.name ?? 'Variable indisponible'} · Bornes :{' '}
            {source?.min ?? '−∞'} à {source?.max ?? '+∞'}
          </p>
          <output aria-label="Valeur du compteur">
            {source?.value ?? 'Variable indisponible'}
          </output>
          <Button
            disabled={blocked || !source}
            onClick={() => {
              if (source)
                void perform(() => writeCounter(source.value - source.step))
            }}
          >
            Diminuer
          </Button>
          <Button
            disabled={blocked || !source}
            onClick={() => {
              if (source)
                void perform(() => writeCounter(source.value + source.step))
            }}
          >
            Augmenter
          </Button>
          <label>
            Valeur du compteur
            <input
              type="number"
              value={valueInput ?? source?.value ?? ''}
              disabled={blocked || !source}
              onChange={(event) => setValueInput(event.target.value)}
            />
          </label>
          <Button
            disabled={blocked || !source || valueInput === null}
            onClick={() =>
              void perform(async () => {
                if (valueInput === null || valueInput.trim() === '')
                  throw new AuthOperationError('INVALID_NUMBER')
                await writeCounter(Number(valueInput))
                setValueInput(null)
              })
            }
          >
            Appliquer la valeur
          </Button>
          <label>
            Pas
            <input
              type="number"
              value={current.config.source.step}
              disabled={locked || pending}
              onChange={(event) =>
                editor.edit({
                  ...current,
                  config: {
                    ...current.config,
                    source: {
                      ...current.config.source,
                      step: event.target.valueAsNumber,
                    },
                  },
                })
              }
            />
          </label>
          {current.config.source.type === 'local' &&
            (['min', 'max'] as const).map((bound) => (
              <label key={bound}>
                {bound === 'min' ? 'Minimum' : 'Maximum'}
                <input
                  type="number"
                  value={
                    current.config.source.type === 'local'
                      ? (current.config.source[bound] ?? '')
                      : ''
                  }
                  disabled={locked || pending}
                  onChange={(event) => {
                    if (current.config.source.type !== 'local') return
                    const updated = { ...current.config.source }
                    if (event.target.value === '') {
                      if (bound === 'min') delete updated.min
                      else delete updated.max
                    } else updated[bound] = event.target.valueAsNumber
                    editor.edit({
                      ...current,
                      config: { ...current.config, source: updated },
                    })
                  }}
                />
              </label>
            ))}
          <label>
            Variable nombre
            <select
              aria-label="Variable nombre"
              value={linkTarget}
              disabled={locked || pending}
              onChange={(event) => setLinkTarget(event.target.value)}
            >
              <option value="">Choisir une variable</option>
              {variables
                ?.filter((variable) => variable.type === 'number')
                .map((variable) => (
                  <option key={variable._id} value={variable._id}>
                    {variable.label || variable.name}
                  </option>
                ))}
            </select>
          </label>
          <Button
            disabled={locked || pending || !linkTarget}
            onClick={() => {
              const variable = variables?.find(
                (entry) => entry._id === linkTarget && entry.type === 'number'
              )
              if (
                variable &&
                window.confirm(
                  'Remplacer la valeur autonome par la variable sélectionnée ?'
                )
              )
                editor.edit({
                  ...current,
                  config: {
                    ...current.config,
                    source: {
                      type: 'variable',
                      variableId: variable._id,
                      step: current.config.source.step,
                    },
                  },
                  state: {},
                })
            }}
          >
            Lier la variable
          </Button>
          {current.config.source.type === 'variable' && (
            <>
              {!source && (
                <label>
                  Valeur locale de détachement
                  <input
                    type="number"
                    value={localValue}
                    onChange={(event) => setLocalValue(event.target.value)}
                    disabled={locked || pending}
                  />
                </label>
              )}
              <Button
                disabled={
                  locked ||
                  pending ||
                  (!source &&
                    (localValue.trim() === '' ||
                      !Number.isFinite(Number(localValue))))
                }
                onClick={() =>
                  editor.edit({
                    ...current,
                    config: {
                      ...current.config,
                      source: {
                        type: 'local',
                        step: current.config.source.step,
                      },
                    },
                    state: { value: source?.value ?? Number(localValue) },
                  })
                }
              >
                Détacher la variable
              </Button>
            </>
          )}
          <Link
            to="/app/projects/$projectId/variables"
            params={{ projectId: widget.projectId }}
          >
            Variables du projet
          </Link>
        </>
      )}
      {current.kind === 'dice' && (
        <>
          <label>
            Expression de dés
            <input
              value={current.config.expression}
              maxLength={40}
              disabled={locked || pending}
              onChange={(event) =>
                editor.edit({
                  ...current,
                  config: { ...current.config, expression: event.target.value },
                })
              }
            />
          </label>
          <Button
            disabled={
              blocked ||
              typeof globalThis.crypto?.getRandomValues !== 'function'
            }
            onClick={() => {
              setError(null)
              try {
                setResult(
                  rollDice(current.config.expression, () => {
                    const words = new Uint32Array(1)
                    globalThis.crypto.getRandomValues(words)
                    return words[0] ?? 0
                  })
                )
              } catch (error_) {
                setError(operationErrorMessage(error_))
              }
            }}
          >
            Lancer
          </Button>
          {typeof globalThis.crypto?.getRandomValues !== 'function' && (
            <p role="alert">Source aléatoire indisponible.</p>
          )}
          <p>
            Dernier résultat en mémoire uniquement, perdu au rechargement et non
            synchronisé.
          </p>
          <div aria-live="polite">
            {result && (
              <>
                <p>Dés : {result.rolls.join(', ')}</p>
                <p>Total : {result.total}</p>
              </>
            )}
          </div>
        </>
      )}
      {editor.conflict && (
        <div role="alert">
          Ce widget a changé dans une autre vue. Votre brouillon est conservé.
          <Button disabled={editor.pending} onClick={() => editor.discard()}>
            Charger la version enregistrée
          </Button>
        </div>
      )}
      {(error || editor.error) && <p role="alert">{error || editor.error}</p>}
      <p role="status">
        {pending
          ? 'Enregistrement…'
          : error
            ? 'Échec de sauvegarde'
            : editor.status}
      </p>
      <Button
        disabled={
          locked ||
          readOnly ||
          pending ||
          !editor.dirty ||
          editor.pending ||
          editor.conflict
        }
        onClick={() => void editor.save()}
      >
        Enregistrer le widget
      </Button>
      <Button disabled={!editor.canUndo} onClick={() => void editor.undo()}>
        Annuler la configuration
      </Button>
      <Button disabled={!editor.canRedo} onClick={() => void editor.redo()}>
        Refaire la configuration
      </Button>
      <RevisionHistory
        target={{ kind: 'note', id: widget._id }}
        version={widget.version}
        disabled={readOnly || dirty}
      />
    </div>
  )
}
