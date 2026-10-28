import type { NoteValue } from '@shared/gm'
import { useRef, useState } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog'

import type { PasteResult } from './paste'
import { convertNotePaste } from './paste'
import { escapeNoteText, safeNoteUrl } from './policy'
import { NoteRender } from './render'

export function NoteInput({
  id,
  value,
  readOnly,
  onEdit,
}: {
  id: string
  value: NoteValue
  readOnly: boolean
  onEdit: (value: NoteValue) => void
}) {
  const textarea = useRef<HTMLTextAreaElement>(null)
  const selection = useRef({ start: 0, end: 0 })
  const composing = useRef(false)
  const [preview, setPreview] = useState(false)
  const [plainPaste, setPlainPaste] = useState(false)
  const [message, setMessage] = useState('')
  const [dialog, setDialog] = useState<'link' | 'details' | null>(null)
  const [label, setLabel] = useState('')
  const [url, setUrl] = useState('')
  const rich = value.bodyFormat === 'markdown-v1'
  function focus(start: number, end = start) {
    requestAnimationFrame(() => {
      textarea.current?.focus()
      textarea.current?.setSelectionRange(start, end)
    })
  }
  function remember() {
    const field = textarea.current
    if (field)
      selection.current = {
        start: field.selectionStart,
        end: field.selectionEnd,
      }
  }
  function insert(
    text: string,
    start = selection.current.start,
    end = selection.current.end
  ) {
    const body = value.body.slice(0, start) + text + value.body.slice(end)
    if (body.length > 50_000) {
      setMessage('Insertion refusée : limite de 50 000 caractères dépassée.')
      focus(start, end)
      return false
    }
    onEdit({ ...value, body })
    focus(start + text.length)
    return true
  }
  function wrap(prefix: string, suffix = prefix) {
    remember()
    const { start, end } = selection.current
    const text = value.body.slice(start, end) || 'texte'
    if (insert(prefix + text + suffix))
      focus(start + prefix.length, start + prefix.length + text.length)
  }
  function lines(prefix: string) {
    remember()
    const start = value.body.lastIndexOf('\n', selection.current.start - 1) + 1
    const newline = value.body.indexOf('\n', selection.current.end)
    const end = newline === -1 ? value.body.length : newline
    insert(
      value.body
        .slice(start, end)
        .split('\n')
        .map((line) => prefix + line)
        .join('\n'),
      start,
      end
    )
  }
  function openDialog(kind: 'link' | 'details') {
    remember()
    setLabel(
      kind === 'link'
        ? value.body.slice(selection.current.start, selection.current.end)
        : ''
    )
    setUrl('')
    setMessage('')
    setDialog(kind)
  }
  function closeDialog() {
    setDialog(null)
    focus(selection.current.start, selection.current.end)
  }
  if (readOnly) return <NoteRender {...value} />
  return (
    <>
      {!rich && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            const body = escapeNoteText(value.body)
              .replaceAll('\n', '&#10;')
              .replaceAll('\t', '&#9;')
              .replaceAll(' ', '&#32;')
            if (body.length > 50_000) {
              setMessage(
                'Activation refusée : le texte échappé dépasse 50 000 caractères.'
              )
              return
            }
            onEdit({ body, bodyFormat: 'markdown-v1' })
            focus(0)
          }}
        >
          Activer le texte riche
        </Button>
      )}
      {rich && (
        <>
          <div
            role="group"
            aria-label="Mise en forme de la note"
            className="flex flex-wrap gap-1"
          >
            <Button
              size="sm"
              variant="outline"
              aria-pressed={!preview}
              onClick={() => {
                setPreview(false)
                focus(selection.current.start)
              }}
            >
              Éditer
            </Button>
            <Button
              size="sm"
              variant="outline"
              aria-pressed={preview}
              onClick={() => {
                remember()
                setPreview(true)
              }}
            >
              Aperçu
            </Button>
            {!preview && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  aria-keyshortcuts="Control+B Meta+B"
                  onClick={() => wrap('**')}
                >
                  Gras
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-keyshortcuts="Control+I Meta+I"
                  onClick={() => wrap('*')}
                >
                  Italique
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-keyshortcuts="Control+K Meta+K"
                  onClick={() => openDialog('link')}
                >
                  Lien
                </Button>
                <label>
                  Titre{' '}
                  <select
                    aria-label="Niveau du titre"
                    defaultValue=""
                    onChange={(event) => {
                      if (event.target.value)
                        lines(`${'#'.repeat(Number(event.target.value))} `)
                      event.target.value = ''
                    }}
                  >
                    <option value="">Choisir</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </label>
                <Button size="sm" variant="outline" onClick={() => lines('- ')}>
                  Liste à puces
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => lines('1. ')}
                >
                  Liste numérotée
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    remember()
                    const text = value.body.slice(
                      selection.current.start,
                      selection.current.end
                    )
                    const fence = '`'.repeat(
                      Math.max(
                        3,
                        ...[...text.matchAll(/`+/gu)].map(
                          (match) => match[0].length + 1
                        )
                      )
                    )
                    if (text.includes('\n'))
                      wrap(`\n${fence}\n`, `\n${fence}\n`)
                    else {
                      const tick = '`'.repeat(
                        Math.max(
                          1,
                          ...[...text.matchAll(/`+/gu)].map(
                            (match) => match[0].length + 1
                          )
                        )
                      )
                      wrap(`${tick} `, ` ${tick}`)
                    }
                  }}
                >
                  Code littéral
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => openDialog('details')}
                >
                  Bloc repliable
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  aria-pressed={plainPaste}
                  onClick={() => {
                    setPlainPaste(!plainPaste)
                    setMessage('Le prochain collage utilisera le texte brut.')
                    focus(selection.current.start, selection.current.end)
                  }}
                >
                  Coller en texte brut
                </Button>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Markdown : **gras**, *italique*, # titre, - liste. Ctrl/Cmd+B, I ou
            K dans le champ.
          </p>
        </>
      )}
      {preview && rich ? (
        <section aria-label="Aperçu de la note">
          <NoteRender {...value} />
        </section>
      ) : (
        <textarea
          ref={textarea}
          id={id}
          aria-label="Contenu de la note"
          className="min-h-10 flex-1 resize-none rounded border bg-background p-2 text-sm"
          value={value.body}
          maxLength={50_000}
          style={{
            backgroundColor: 'transparent',
            color: 'inherit',
            fontSize: 'inherit',
            fontFamily: 'inherit',
          }}
          onChange={(event) => onEdit({ ...value, body: event.target.value })}
          onSelect={remember}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
          }}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (
              !rich ||
              composing.current ||
              event.nativeEvent.isComposing ||
              !(event.ctrlKey || event.metaKey) ||
              event.altKey
            )
              return
            const key = event.key.toLowerCase()
            if (!['b', 'i', 'k'].includes(key)) return
            event.preventDefault()
            if (key === 'b') wrap('**')
            if (key === 'i') wrap('*')
            if (key === 'k') openDialog('link')
          }}
          onPaste={(event) => {
            if (!rich) return
            event.preventDefault()
            event.stopPropagation()
            remember()
            const plain = event.clipboardData.getData('text/plain')
            const result: PasteResult = plainPaste
              ? {
                  body: escapeNoteText(plain),
                  message: 'Collage en texte brut.',
                  fallback: true,
                }
              : convertNotePaste(
                  event.clipboardData.getData('text/html'),
                  plain
                )
            if (result.requiresPlainPaste) {
              setMessage(result.message)
              focus(selection.current.start, selection.current.end)
              return
            }
            setPlainPaste(false)
            if (insert(result.body)) setMessage(result.message)
          }}
        />
      )}
      {message && (
        <p role="status" className="text-xs">
          {message}
        </p>
      )}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) closeDialog()
        }}
      >
        <DialogContent finalFocus={textarea}>
          <DialogTitle>
            {dialog === 'link'
              ? 'Insérer un lien'
              : 'Insérer un bloc repliable'}
          </DialogTitle>
          <DialogDescription>
            {dialog === 'link'
              ? 'Lien absolu HTTP, HTTPS ou mailto.'
              : 'Résumé textuel obligatoire, 120 caractères maximum.'}
          </DialogDescription>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (
                !label.trim() ||
                (dialog === 'details' &&
                  (label.length > 120 || /[\r\n]/u.test(label)))
              ) {
                setMessage('Résumé ou libellé invalide.')
                return
              }
              if (dialog === 'link') {
                const safe = safeNoteUrl(url)
                if (!safe) {
                  setMessage('URL refusée : HTTP, HTTPS ou mailto uniquement.')
                  return
                }
                if (
                  !insert(
                    `[${escapeNoteText(label)}](${safe.replaceAll('(', '%28').replaceAll(')', '%29').replaceAll('\\', '%5C')})`
                  )
                )
                  return
              } else {
                const text = value.body.slice(
                  selection.current.start,
                  selection.current.end
                )
                if (text.includes(':::')) {
                  setMessage('Les blocs repliables imbriqués sont refusés.')
                  return
                }
                if (
                  !insert(
                    `\n:::details[${escapeNoteText(label)}]\n${text}\n:::\n`
                  )
                )
                  return
              }
              setDialog(null)
            }}
          >
            <label>
              {dialog === 'link' ? 'Libellé' : 'Résumé'}
              <input
                required
                value={label}
                maxLength={dialog === 'details' ? 120 : 50_000}
                onChange={(event) => setLabel(event.target.value)}
              />
            </label>
            {dialog === 'link' && (
              <label>
                URL
                <input
                  required
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                />
              </label>
            )}
            <Button type="submit">Insérer</Button>
            <Button type="button" variant="outline" onClick={closeDialog}>
              Annuler
            </Button>
            {message && <p role="alert">{message}</p>}
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
