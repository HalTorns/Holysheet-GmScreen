import type { Widget } from '@convex/lib/gmFormats'
import { initiativeOrder, removeInitiative } from '@shared/gm-session'

import { Button } from '@/components/ui/button'

type Session = Extract<Widget, { kind: 'table' | 'clock' | 'initiative' }>
export function InitiativeWidget({
  widget,
  readOnly,
  disabled,
  sessionDisabled,
  edit,
  advance,
  reset,
}: {
  widget: Extract<Session, { kind: 'initiative' }>
  readOnly: boolean
  disabled: boolean
  sessionDisabled: boolean
  edit: (value: Session) => void
  advance: () => void
  reset: () => void
}) {
  return (
    <>
      <p role="status">Round {widget.state.round}</p>
      <ol>
        {initiativeOrder(widget.state.entries).map((entry) => (
          <li
            key={entry.id}
            aria-current={
              entry.id === widget.state.currentId ? 'true' : undefined
            }
          >
            {entry.id === widget.state.currentId && (
              <strong>Tour actuel : </strong>
            )}
            {readOnly ? (
              <>
                {entry.name} ({entry.score}) {entry.note}
              </>
            ) : (
              <>
                <label>
                  Nom
                  <input
                    aria-label={`Nom de ${entry.name}`}
                    value={entry.name}
                    maxLength={60}
                    disabled={disabled}
                    onChange={(event) =>
                      edit({
                        ...widget,
                        state: {
                          ...widget.state,
                          entries: widget.state.entries.map((item) =>
                            item.id === entry.id
                              ? { ...item, name: event.target.value }
                              : item
                          ),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Score
                  <input
                    aria-label={`Score de ${entry.name}`}
                    type="number"
                    min={-999}
                    max={999}
                    value={entry.score}
                    disabled={disabled}
                    onChange={(event) =>
                      edit({
                        ...widget,
                        state: {
                          ...widget.state,
                          entries: widget.state.entries.map((item) =>
                            item.id === entry.id
                              ? { ...item, score: event.target.valueAsNumber }
                              : item
                          ),
                        },
                      })
                    }
                  />
                </label>
                <label>
                  Note
                  <input
                    aria-label={`Note de ${entry.name}`}
                    value={entry.note}
                    maxLength={120}
                    disabled={disabled}
                    onChange={(event) =>
                      edit({
                        ...widget,
                        state: {
                          ...widget.state,
                          entries: widget.state.entries.map((item) =>
                            item.id === entry.id
                              ? { ...item, note: event.target.value }
                              : item
                          ),
                        },
                      })
                    }
                  />
                </label>
                <Button
                  disabled={disabled}
                  onClick={() =>
                    edit({
                      ...widget,
                      state: removeInitiative(widget.state, entry.id),
                    })
                  }
                >
                  Retirer {entry.name}
                </Button>
              </>
            )}
          </li>
        ))}
      </ol>
      {!readOnly && (
        <>
          <Button
            disabled={disabled || widget.state.entries.length >= 30}
            onClick={() =>
              edit({
                ...widget,
                state: {
                  ...widget.state,
                  entries: [
                    ...widget.state.entries,
                    {
                      id: crypto.randomUUID(),
                      name: `Participant ${widget.state.entries.length + 1}`,
                      score: 0,
                      note: '',
                    },
                  ],
                },
              })
            }
          >
            Ajouter un participant
          </Button>
          <Button
            disabled={sessionDisabled || !widget.state.entries.length}
            onClick={advance}
          >
            Tour suivant
          </Button>
          <Button disabled={sessionDisabled} onClick={reset}>
            Réinitialiser l’initiative
          </Button>
        </>
      )}
    </>
  )
}
