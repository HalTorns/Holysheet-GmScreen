import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist'
import { useEffect, useRef, useState } from 'react'

import { Button } from '@/components/ui/button'

export function PdfView({
  url,
  page,
  onPage,
}: {
  url: string
  page: number
  onPage?: ((page: number) => void) | undefined
}) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [loaded, setLoaded] = useState<{
    url: string
    document: PDFDocumentProxy
  } | null>(null)
  const document = loaded?.url === url ? loaded.document : null
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  const error = failedUrl === url
  const [width, setWidth] = useState(400)
  const container = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const element = container.current
    if (!element) return undefined
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(Math.max(1, entry.contentRect.width))
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useEffect(() => {
    let cancelled = false
    let destroy: (() => Promise<void>) | undefined
    async function load() {
      const [pdf, worker] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
      ])
      if (cancelled) return
      pdf.GlobalWorkerOptions.workerSrc = worker.default
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer())
      if (cancelled) return
      const task = pdf.getDocument({
        data: bytes,
        isEvalSupported: false,
        useWasm: false,
        disableFontFace: true,
      })
      destroy = () => task.destroy()
      const loaded = await task.promise
      if (!cancelled) setLoaded({ url, document: loaded })
    }
    void load().catch(() => {
      if (!cancelled) setFailedUrl(url)
    })
    return () => {
      cancelled = true
      void destroy?.()
    }
  }, [url])
  const current = document ? Math.max(1, Math.min(document.numPages, page)) : 1
  useEffect(() => {
    let cancelled = false
    let task: RenderTask | undefined
    const element = canvas.current
    async function draw() {
      if (!document || !element) return
      const pdfPage = await document.getPage(current)
      if (cancelled) return
      const viewport = pdfPage.getViewport({
        scale: width / pdfPage.getViewport({ scale: 1 }).width,
      })
      element.width = Math.ceil(viewport.width)
      element.height = Math.ceil(viewport.height)
      task = pdfPage.render({ canvas: element, viewport })
      await task.promise
    }
    void draw().catch(() => {
      if (!cancelled) setFailedUrl(url)
    })
    return () => {
      cancelled = true
      task?.cancel()
    }
  }, [document, current, width, url])
  return (
    <div ref={container}>
      {error ? (
        <p role="alert">PDF indisponible</p>
      ) : (
        <canvas ref={canvas} aria-label={`Page PDF ${current}`} />
      )}
      {!document && !error && <p role="status">Chargement du PDF…</p>}
      {document && (
        <p>
          Page {current} / {document.numPages}
        </p>
      )}
      {document && onPage && (
        <div>
          <Button disabled={current <= 1} onClick={() => onPage(current - 1)}>
            Page précédente
          </Button>
          <label>
            Page PDF
            <input
              aria-label="Page PDF"
              type="number"
              min={1}
              max={document.numPages}
              value={current}
              onChange={(event) => {
                const value = event.target.valueAsNumber
                if (Number.isInteger(value))
                  onPage(Math.max(1, Math.min(document.numPages, value)))
              }}
            />
          </label>
          <Button
            disabled={current >= document.numPages}
            onClick={() => onPage(current + 1)}
          >
            Page suivante
          </Button>
        </div>
      )}
    </div>
  )
}
