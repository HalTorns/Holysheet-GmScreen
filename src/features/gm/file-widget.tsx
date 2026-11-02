import { api } from '@convex/_generated/api'
import type { Widget } from '@convex/lib/gmFormats'
import { useMutation, usePaginatedQuery, useQuery } from 'convex/react'
import { lazy, Suspense, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import { operationErrorMessage } from '@/features/auth/errors'

const PdfView = lazy(() =>
  import('./pdf-view').then((module) => ({ default: module.PdfView }))
)
type FileWidgetValue = Extract<Widget, { kind: 'image' | 'pdf' }>
export function FileWidget({
  widget,
  readOnly,
  locked = false,
}: {
  widget: FileWidgetValue
  readOnly: boolean
  locked?: boolean
}) {
  const file = useQuery(api.gmFiles.getWidgetFile, { widgetId: widget._id })
  const update = useMutation(api.gmWidgets.updateWidget)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const drag = useRef<{ x: number; y: number } | null>(null)
  async function save(value: FileWidgetValue) {
    if (pending) return
    setPending(true)
    setError(null)
    try {
      if (value.kind === 'image')
        await update({
          id: value._id,
          expectedVersion: value.version,
          widget: {
            kind: value.kind,
            config: value.config,
            state: value.state,
          },
        })
      else
        await update({
          id: value._id,
          expectedVersion: value.version,
          widget: {
            kind: value.kind,
            config: value.config,
            state: value.state,
          },
        })
    } catch (error_) {
      setError(operationErrorMessage(error_))
    } finally {
      setPending(false)
    }
  }
  if (file === undefined) return <p role="status">Chargement du fichier…</p>
  if (!file)
    return (
      <div>
        <p>Fichier indisponible</p>
        {!readOnly && !locked && (
          <FilePicker
            widget={widget}
            pending={pending}
            onChoose={(value) => {
              void save(value)
            }}
          />
        )}
        {error && <p role="alert">{error}</p>}
      </div>
    )
  return (
    <div className="h-full overflow-auto">
      {widget.kind === 'image' ? (
        <>
          <div
            className={
              readOnly
                ? 'h-full overflow-hidden'
                : 'h-40 touch-none overflow-hidden'
            }
            onPointerDown={(event) => {
              if (readOnly || pending) return
              event.stopPropagation()
              event.currentTarget.setPointerCapture(event.pointerId)
              drag.current = { x: event.clientX, y: event.clientY }
            }}
            onPointerUp={(event) => {
              if (!drag.current || readOnly) return
              event.stopPropagation()
              const start = drag.current
              drag.current = null
              void save({
                ...widget,
                state: {
                  ...widget.state,
                  x: Math.max(
                    -16_384,
                    Math.min(16_384, widget.state.x + event.clientX - start.x)
                  ),
                  y: Math.max(
                    -16_384,
                    Math.min(16_384, widget.state.y + event.clientY - start.y)
                  ),
                },
              })
            }}
          >
            <img
              src={file.url}
              alt={widget.config.alt || file.name}
              draggable={false}
              style={{
                width: '100%',
                height: '100%',
                objectFit: widget.config.fit,
                transform: `translate(${widget.state.x}px, ${widget.state.y}px) scale(${widget.state.zoom})`,
              }}
            />
          </div>
          {!readOnly && (
            <>
              <label>
                Zoom image
                <input
                  aria-label="Zoom image"
                  type="range"
                  min={0.1}
                  max={10}
                  step={0.1}
                  disabled={pending}
                  value={widget.state.zoom}
                  onChange={(event) =>
                    void save({
                      ...widget,
                      state: {
                        ...widget.state,
                        zoom: event.target.valueAsNumber,
                      },
                    })
                  }
                />
              </label>
              <Button
                disabled={pending}
                onClick={() =>
                  void save({ ...widget, state: { zoom: 1, x: 0, y: 0 } })
                }
              >
                Recentrer l’image
              </Button>
              <label>
                Texte alternatif
                <input
                  disabled={locked || pending}
                  maxLength={500}
                  defaultValue={widget.config.alt}
                  onBlur={(event) => {
                    if (event.target.value !== widget.config.alt)
                      void save({
                        ...widget,
                        config: { ...widget.config, alt: event.target.value },
                      })
                  }}
                />
              </label>
              <label>
                Ajustement image
                <select
                  value={widget.config.fit}
                  disabled={locked || pending}
                  onChange={(event) => {
                    const fit = event.target.value
                    if (fit === 'contain' || fit === 'cover')
                      void save({
                        ...widget,
                        config: { ...widget.config, fit },
                      })
                  }}
                >
                  <option value="contain">Contenir</option>
                  <option value="cover">Couvrir</option>
                </select>
              </label>
            </>
          )}
        </>
      ) : (
        <Suspense fallback={<p role="status">Chargement du lecteur PDF…</p>}>
          <PdfView
            url={file.url}
            page={readOnly ? 1 : widget.state.page}
            onPage={
              readOnly || pending
                ? undefined
                : (page) => {
                    void save({ ...widget, state: { page } })
                  }
            }
          />
        </Suspense>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  )
}

function FilePicker({
  widget,
  pending,
  onChoose,
}: {
  widget: FileWidgetValue
  pending: boolean
  onChoose: (widget: FileWidgetValue) => void
}) {
  const files = usePaginatedQuery(
    api.gmFiles.listFiles,
    { projectId: widget.projectId, trash: false },
    { initialNumItems: 20 }
  )
  return (
    <div>
      <label>
        Choisir un fichier
        <select
          aria-label="Choisir un fichier"
          disabled={pending}
          value=""
          onChange={(event) => {
            const file = files.results.find(
              (entry) => entry._id === event.target.value
            )
            if (!file) return
            if (widget.kind === 'image')
              onChoose({
                ...widget,
                config: { ...widget.config, fileId: file._id },
              })
            else
              onChoose({
                ...widget,
                config: { fileId: file._id },
                state: { page: 1 },
              })
          }}
        >
          <option value="">Choisir un fichier</option>
          {files.results
            .filter(
              (file) =>
                (widget.kind === 'pdf') ===
                (file.mimeType === 'application/pdf')
            )
            .map((file) => (
              <option key={file._id} value={file._id}>
                {file.name}
              </option>
            ))}
        </select>
      </label>
      {files.status === 'CanLoadMore' && (
        <Button onClick={() => files.loadMore(20)}>
          Plus de fichiers disponibles
        </Button>
      )}
    </div>
  )
}
