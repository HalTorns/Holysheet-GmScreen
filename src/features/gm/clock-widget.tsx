import type { Widget } from '@convex/lib/gmFormats'
import { clockElapsed, formatClock } from '@shared/gm-session'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

type Session = Extract<Widget, { kind: 'table' | 'clock' | 'initiative' }>
type Clock = Extract<Session, { kind: 'clock' }>
type Action = 'start' | 'pause' | 'reset' | { filled: number }
export function ClockWidget({
  widget,
  readOnly,
  locked,
  disabled,
  sessionDisabled,
  offset,
  edit,
  control,
}: {
  widget: Clock
  readOnly: boolean
  locked: boolean
  disabled: boolean
  sessionDisabled: boolean
  offset: number
  edit: (value: Session) => void
  control: (action: Action) => void
}) {
  const [now, setNow] = useState(() => Date.now())
  const running = 'running' in widget.state && widget.state.running
  useEffect(() => {
    if (readOnly || !running) return undefined
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [readOnly, running])
  const elapsed =
    'running' in widget.state
      ? clockElapsed(
          widget.state,
          Math.max(now, (widget.state.startedAt ?? 0) - offset) + offset
        )
      : 0
  const remaining =
    widget.config.mode === 'timer'
      ? Math.max(0, widget.config.durationMs - elapsed)
      : elapsed
  return (
    <>
      {widget.config.mode === 'segments' && 'filled' in widget.state ? (
        <fieldset disabled={readOnly || sessionDisabled}>
          <legend>{widget.config.title || 'Progression'}</legend>
          {Array.from({ length: widget.config.segments }, (_, index) => (
            <label key={index}>
              <input
                type="checkbox"
                aria-label={`Segment ${index + 1}`}
                checked={
                  'filled' in widget.state && widget.state.filled > index
                }
                onChange={(event) =>
                  control({ filled: event.target.checked ? index + 1 : index })
                }
              />
              {index + 1}
            </label>
          ))}
        </fieldset>
      ) : (
        <>
          <output aria-label="Temps de l’horloge">
            {formatClock(remaining)}
          </output>
          <p role="status">
            {widget.config.mode === 'timer' && remaining === 0 ? 'Terminé' : ''}
          </p>
          {!readOnly && (
            <>
              <Button
                disabled={sessionDisabled}
                onClick={() => control(running ? 'pause' : 'start')}
              >
                {running ? 'Pause' : 'Démarrer'}
              </Button>
              <Button
                disabled={sessionDisabled}
                onClick={() => control('reset')}
              >
                Remettre à zéro
              </Button>
            </>
          )}
        </>
      )}
      {!readOnly && (
        <>
          <label>
            Mode de l’horloge
            <select
              value={widget.config.mode}
              disabled={locked || disabled}
              onChange={(event) => {
                const mode = event.target.value
                if (mode === 'segments')
                  edit({
                    ...widget,
                    config: { title: widget.config.title, mode, segments: 6 },
                    state: { filled: 0 },
                  })
                else if (mode === 'timer')
                  edit({
                    ...widget,
                    config: {
                      title: widget.config.title,
                      mode,
                      durationMs: 60_000,
                    },
                    state: { running: false, elapsedMs: 0 },
                  })
                else if (mode === 'stopwatch')
                  edit({
                    ...widget,
                    config: { title: widget.config.title, mode },
                    state: { running: false, elapsedMs: 0 },
                  })
              }}
            >
              <option value="stopwatch">Chronomètre</option>
              <option value="timer">Minuteur</option>
              <option value="segments">Cases</option>
            </select>
          </label>
          {widget.config.mode === 'timer' && (
            <label>
              Durée en secondes
              <input
                type="number"
                min={1}
                max={86_400}
                value={widget.config.durationMs / 1000}
                disabled={locked || disabled}
                onChange={(event) =>
                  edit({
                    ...widget,
                    config: {
                      title: widget.config.title,
                      mode: 'timer',
                      durationMs: event.target.valueAsNumber * 1000,
                    },
                    state: { running: false, elapsedMs: 0 },
                  })
                }
              />
            </label>
          )}
          {widget.config.mode === 'segments' && (
            <label>
              Nombre de cases
              <input
                type="number"
                min={2}
                max={12}
                value={widget.config.segments}
                disabled={locked || disabled}
                onChange={(event) =>
                  edit({
                    ...widget,
                    config: {
                      title: widget.config.title,
                      mode: 'segments',
                      segments: event.target.valueAsNumber,
                    },
                    state: { filled: 0 },
                  })
                }
              />
            </label>
          )}
          <p>
            Une vue qui n’a jamais piloté l’horloge utilise son heure système ;
            un décalage peut subsister.
          </p>
        </>
      )}
    </>
  )
}
