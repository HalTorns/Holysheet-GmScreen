import { api } from '@convex/_generated/api'
import type { Widget } from '@convex/lib/gmFormats'
import { parseEmbedUrl } from '@shared/embed-url'
import { useMutation } from 'convex/react'
import { useCallback, useEffect } from 'react'

import { DraftGuard } from '@/components/draft-guard'
import { Button } from '@/components/ui/button'
import { env } from '@/env'

import { RevisionHistory } from './revision-history'
import { useEditorDraft } from './use-editor-draft'

type Embed = Extract<Widget, { kind: 'embed' }>
const appOrigins = [
  env.VITE_SITE_URL,
  env.VITE_CONVEX_URL,
  env.VITE_CONVEX_SITE_URL,
]
function parsedConfig(config: Embed['config']) {
  return parseEmbedUrl(config.url, appOrigins)
}
function EmbedPreview({
  config,
  staticRender = false,
}: {
  config: Embed['config']
  staticRender?: boolean
}) {
  if (!config.url) return <p>Configurer le lien</p>
  const parsed = parsedConfig(config)
  if (staticRender)
    return (
      <div>
        <h3>{config.title || 'Lien web'}</h3>
        <p>{parsed?.url ?? config.url}</p>
        <p>contenu intégré non imprimable</p>
      </div>
    )
  if (!parsed)
    return (
      <div>
        <h3>{config.title || 'Lien web'}</h3>
        <p>{config.url}</p>
        <p>URL invalide</p>
      </div>
    )
  return (
    <div>
      <h3>{config.title || 'Lien web'}</h3>
      <p>{parsed.hostname}</p>
      <a href={parsed.url} target="_blank" rel="noopener noreferrer">
        {config.mode === 'frame'
          ? 'Ouvrir dans un nouvel onglet'
          : config.title || parsed.url}
      </a>
      {config.mode === 'frame' && (
        <p>Si rien ne s&apos;affiche, ce site refuse l&apos;intégration.</p>
      )}
      {config.mode === 'frame' && (
        <iframe
          title={config.title || 'Contenu intégré'}
          src={parsed.url}
          // oxlint-disable-next-line react/iframe-missing-sandbox -- F7b: the canonical URL guard forbids all app origins before rendering this third-party frame.
          sandbox="allow-scripts allow-same-origin allow-forms"
          referrerPolicy="no-referrer"
          allow=""
          loading="lazy"
          // React DOM supports this boolean attribute; 19.3 types omit it.
          {...{ credentialless: true }}
          className="h-64 w-full"
        />
      )}
    </div>
  )
}
export function EmbedWidget({
  widget,
  readOnly,
  locked,
  autoSave,
  onDirtyChange,
}: {
  widget: Embed
  readOnly: boolean
  locked: boolean
  autoSave: boolean
  onDirtyChange: (id: string, dirty: boolean) => void
}) {
  const update = useMutation(api.gmWidgets.updateWidget)
  const persist = useCallback(
    (value: Embed, expectedVersion: number) =>
      update({
        id: widget._id,
        expectedVersion,
        widget: { kind: 'embed', config: value.config, state: {} },
      }),
    [update, widget._id]
  )
  const editor = useEditorDraft({
    value: widget,
    version: widget.version,
    onSave: persist,
    autoSave,
    paused: locked || readOnly,
  })
  const current = editor.value
  const invalid = current.config.url !== '' && !parsedConfig(current.config)
  const disabled = locked || readOnly || editor.pending
  useEffect(() => {
    onDirtyChange(widget._id, editor.dirty || editor.pending)
  }, [widget._id, editor.dirty, editor.pending, onDirtyChange])
  useEffect(
    () => () => onDirtyChange(widget._id, false),
    [widget._id, onDirtyChange]
  )
  return (
    <div className="h-full overflow-auto">
      <div className="hidden print:block">
        <EmbedPreview config={widget.config} staticRender />
      </div>
      <div className="print:hidden">
        <EmbedPreview config={widget.config} />
        {!readOnly && (
          <>
            <DraftGuard dirty={editor.dirty} />
            <label>
              Titre du widget
              <input
                value={current.config.title}
                maxLength={120}
                disabled={disabled}
                onChange={(event) =>
                  editor.edit({
                    ...current,
                    config: { ...current.config, title: event.target.value },
                  })
                }
              />
            </label>
            <label>
              URL du lien
              <input
                value={current.config.url}
                aria-invalid={invalid}
                disabled={disabled}
                onChange={(event) =>
                  editor.edit({
                    ...current,
                    config: { ...current.config, url: event.target.value },
                  })
                }
              />
            </label>
            <label>
              Mode du lien
              <select
                value={current.config.mode}
                disabled={disabled}
                onChange={(event) => {
                  const mode = event.target.value
                  if (mode === 'link' || mode === 'frame')
                    editor.edit({
                      ...current,
                      config: { ...current.config, mode },
                    })
                }}
              >
                <option value="link">Lien</option>
                <option value="frame">Cadre intégré</option>
              </select>
            </label>
            {invalid && (
              <p role="alert">
                URL invalide : utilisez une adresse HTTPS publique, extérieure à
                l&apos;application.
              </p>
            )}
            {editor.conflict && (
              <div role="alert">
                Ce widget a changé dans une autre vue. Votre brouillon est
                conservé.
                <Button
                  disabled={editor.pending}
                  onClick={() => editor.discard()}
                >
                  Charger la version enregistrée
                </Button>
              </div>
            )}
            {editor.error && <p role="alert">{editor.error}</p>}
            <p role="status">{editor.status}</p>
            <Button
              disabled={disabled || invalid || !editor.dirty || editor.conflict}
              onClick={() => void editor.save()}
            >
              Enregistrer le widget
            </Button>
            <RevisionHistory
              target={{ kind: 'note', id: widget._id }}
              version={widget.version}
              disabled={disabled || editor.dirty}
            />
          </>
        )}
      </div>
    </div>
  )
}
