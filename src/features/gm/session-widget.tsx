import { api } from '@convex/_generated/api'
import type { Widget } from '@convex/lib/gmFormats'
import { gmWidgetLabels } from '@shared/gm'
import { advanceInitiative, clockElapsed } from '@shared/gm-session'
import { useMutation } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'

import { DraftGuard } from '@/components/draft-guard'
import { Button } from '@/components/ui/button'
import { convexErrorCode, operationErrorMessage } from '@/features/auth/errors'

import { ClockWidget } from './clock-widget'
import { InitiativeWidget } from './initiative-widget'
import { RevisionHistory } from './revision-history'
import { TableWidget } from './table-widget'
import { useEditorDraft } from './use-editor-draft'

type Session = Extract<Widget, { kind: 'table' | 'clock' | 'initiative' }>
type Action = 'start' | 'pause' | 'reset' | { filled: number }
export function SessionWidget({
  widget,
  locked,
  readOnly,
  autoSave,
  onDirtyChange,
}: {
  widget: Session
  locked: boolean
  readOnly: boolean
  autoSave: boolean
  onDirtyChange: (id: string, dirty: boolean) => void
}) {
  const update = useMutation(api.gmWidgets.updateWidget)
  const control = useMutation(api.gmWidgets.controlClock)
  const persist = useCallback(
    (value: Session, expectedVersion: number) => {
      if (value.kind === 'table')
        return update({
          id: widget._id,
          expectedVersion,
          widget: {
            kind: value.kind,
            config: value.config,
            state: value.state,
          },
        })
      if (value.kind === 'clock')
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
    paused: readOnly,
  })
  const [optimistic, setOptimistic] = useState<{
    version: number
    value: Session
  } | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inFlight = useRef(false)
  const [offset, setOffset] = useState(0)
  const current =
    optimistic?.version === widget.version ? optimistic.value : editor.value
  const dirty = editor.dirty || editor.pending || pending
  useEffect(() => {
    onDirtyChange(widget._id, dirty)
  }, [widget._id, dirty, onDirtyChange])
  useEffect(
    () => () => onDirtyChange(widget._id, false),
    [widget._id, onDirtyChange]
  )
  const blocked = readOnly || pending || editor.pending || editor.conflict
  async function write(value: Session, action?: Action) {
    if (inFlight.current || blocked || editor.dirty) return
    inFlight.current = true
    setPending(true)
    setError(null)
    setOptimistic({ version: widget.version, value })
    const sentAt = Date.now()
    try {
      if (action === undefined) await persist(value, widget.version)
      else {
        const result = await control({
          id: widget._id,
          expectedVersion: widget.version,
          action,
        })
        setOffset(result.serverNow - (sentAt + Date.now()) / 2)
      }
    } catch (error_) {
      setOptimistic(null)
      if (action === undefined) editor.edit(value, widget.version)
      else if (convexErrorCode(error_) === 'CONFLICT')
        editor.edit(widget, widget.version)
      setError(operationErrorMessage(error_))
    } finally {
      setPending(false)
      inFlight.current = false
    }
  }
  function title(value: string) {
    if (current.kind === 'table')
      editor.edit({ ...current, config: { ...current.config, title: value } })
    else if (current.kind === 'clock')
      editor.edit({ ...current, config: { ...current.config, title: value } })
    else editor.edit({ ...current, config: { title: value } })
  }
  return (
    <div className="flex h-full flex-col gap-2 overflow-auto">
      <DraftGuard dirty={dirty} />
      {readOnly && current.kind !== 'table' && (
        <h3>{current.config.title || gmWidgetLabels[current.kind]}</h3>
      )}
      {!readOnly && (
        <label>
          Titre du widget
          <input
            value={current.config.title}
            maxLength={120}
            disabled={locked || blocked}
            onChange={(event) => title(event.target.value)}
          />
        </label>
      )}
      {current.kind === 'table' && (
        <TableWidget
          widget={current}
          locked={locked}
          readOnly={readOnly}
          disabled={blocked}
          edit={editor.edit}
          paste={(value) => void write(value)}
          sessionDisabled={editor.dirty || blocked}
        />
      )}
      {current.kind === 'clock' && (
        <ClockWidget
          widget={current}
          readOnly={readOnly}
          locked={locked}
          disabled={blocked}
          sessionDisabled={editor.dirty || blocked}
          offset={offset}
          edit={editor.edit}
          control={(action) => {
            let state = current.state
            if (typeof action !== 'string') state = { filled: action.filled }
            else if ('running' in state) {
              if (action === 'reset') state = { running: false, elapsedMs: 0 }
              else if (action === 'start')
                state = {
                  running: true,
                  startedAt: Date.now() + offset,
                  elapsedMs: state.elapsedMs,
                }
              else
                state = {
                  running: false,
                  elapsedMs: clockElapsed(state, Date.now() + offset),
                }
            }
            void write({ ...current, state }, action)
          }}
        />
      )}
      {current.kind === 'initiative' && (
        <InitiativeWidget
          widget={current}
          readOnly={readOnly}
          disabled={blocked}
          sessionDisabled={editor.dirty || blocked}
          edit={editor.edit}
          advance={() =>
            void write({ ...current, state: advanceInitiative(current.state) })
          }
          reset={() =>
            void write({
              ...current,
              state: { entries: current.state.entries, round: 1 },
            })
          }
        />
      )}
      {!readOnly && (
        <>
          {editor.conflict && (
            <div role="alert">
              Ce widget a changé dans une autre vue. Votre brouillon est
              conservé.
              <Button
                disabled={editor.pending}
                onClick={() => {
                  editor.discard()
                  setError(null)
                }}
              >
                Charger la version enregistrée
              </Button>
            </div>
          )}
          {(error || editor.error) && (
            <p role="alert">{error || editor.error}</p>
          )}
          <p role="status">{pending ? 'Enregistrement…' : editor.status}</p>
          <Button
            disabled={
              blocked ||
              !editor.dirty ||
              (locked &&
                JSON.stringify(current.config) !==
                  JSON.stringify(widget.config))
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
            disabled={dirty}
          />
        </>
      )}
    </div>
  )
}
