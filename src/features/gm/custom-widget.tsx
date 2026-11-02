import { api } from '@convex/_generated/api'
import type { Widget } from '@convex/lib/gmFormats'
import { customSettings } from '@shared/custom-widget-protocol'
import { useMutation, useQuery } from 'convex/react'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { operationErrorMessage } from '@/features/auth/errors'

import { CustomFrame } from './custom-frame'
import { createCustomStateWriter } from './custom-state-writer'

export function CustomWidget({
  widget,
  readOnly,
  locked,
}: {
  widget: Extract<Widget, { kind: 'custom' }>
  readOnly: boolean
  locked: boolean
}) {
  const definition = useQuery(api.customWidgets.getForWidget, {
    widgetId: widget._id,
  })
  const save = useMutation(api.customWidgets.saveState)
  const update = useMutation(api.gmWidgets.updateWidget)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState(
    customSettings.parse(widget.config.settings)
  )
  const [printing, setPrinting] = useState(false)
  useEffect(() => {
    const media = matchMedia('print')
    const change = () => setPrinting(media.matches)
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  const id = widget._id
  const [writerVersion, setWriterVersion] = useState({
    version: widget.version,
  })
  const [local, setLocal] = useState<{
    state: typeof widget.state
    committedVersion: number | null
  } | null>(null)
  const resetVersion = () => {
    setWriterVersion({ version: widget.version })
    setError('')
  }
  const writer = useMemo(
    () =>
      createCustomStateWriter(
        writerVersion.version,
        (state, expectedVersion) => save({ id, state, expectedVersion }),
        (error_) => setError(operationErrorMessage(error_)),
        (state, version) =>
          setLocal((current) =>
            current?.state === state
              ? { state, committedVersion: version }
              : current
          )
      ),
    [id, save, writerVersion]
  )
  useEffect(() => {
    writer.enable(!readOnly && !printing)
  }, [writer, readOnly, printing])
  useEffect(() => {
    writer.observe(widget.version)
  }, [writer, widget.version])
  useEffect(() => () => writer.close(), [writer])
  // Removing the callback prevents persistence even if user code ignores its mode.
  const receive = useCallback(
    (state: Parameters<typeof writer.push>[0]) => {
      if (!readOnly && !printing) {
        setLocal({ state, committedVersion: null })
        writer.push(state)
      }
    },
    [writer, readOnly, printing]
  )
  if (definition === undefined)
    return <p role="status">Chargement du widget…</p>
  if (!definition) return <p>Widget indisponible</p>
  return (
    <div>
      <h3>{definition.name}</h3>
      <CustomFrame
        key={`${definition._id}:${definition.version}:${printing}`}
        input={{
          type: 'init',
          html: definition.html,
          css: definition.css,
          js: definition.compiled,
          settings: customSettings.parse(widget.config.settings),
          state:
            local &&
            (local.committedVersion === null ||
              widget.version < local.committedVersion)
              ? local.state
              : widget.state,
          mode: printing ? 'static' : 'live',
          theme: 'light',
        }}
        onState={receive}
      />
      {!readOnly && !printing && (
        <fieldset disabled={locked}>
          <legend>Réglages du widget</legend>
          {Object.entries(settings).map(([key, value]) => (
            <label key={key}>
              {key}
              <input
                aria-label={`Réglage ${key}`}
                value={
                  typeof value === 'string' ? value : JSON.stringify(value)
                }
                onChange={(event) =>
                  setSettings({ ...settings, [key]: event.target.value })
                }
              />
            </label>
          ))}
          <Button
            onClick={() => {
              const key = window.prompt('Clé du réglage')
              if (key && key.length <= 80)
                setSettings({ ...settings, [key]: '' })
            }}
          >
            Ajouter un réglage
          </Button>
          <Button
            onClick={() => {
              const parsed = customSettings.safeParse(settings)
              if (!parsed.success) {
                setError('Réglages invalides')
                return
              }
              void update({
                id,
                expectedVersion: widget.version,
                widget: {
                  kind: 'custom',
                  config: { ...widget.config, settings: parsed.data },
                  state: widget.state,
                },
              }).catch((error_) => setError(operationErrorMessage(error_)))
            }}
          >
            Enregistrer les réglages
          </Button>
        </fieldset>
      )}
      {error && (
        <p role="alert">
          {error}
          <Button onClick={resetVersion}>Reprendre la sauvegarde</Button>
        </p>
      )}
    </div>
  )
}
