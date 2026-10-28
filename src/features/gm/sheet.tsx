import { api } from '@convex/_generated/api'
import type { GmSheetKind } from '@shared/gm'
import {
  GM_MAX_SHEET_FIELDS,
  GM_MAX_SHEET_LINKS,
  gmSheetKindLabels,
  gmSheetKindOf,
  gmSheetKinds,
} from '@shared/gm'
import { Link, useNavigate } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useState } from 'react'

import { DraftGuard } from '@/components/draft-guard'
import { Button } from '@/components/ui/button'
import { convexErrorCode, operationErrorMessage } from '@/features/auth/errors'

import { reconcileDraft } from './sheet-draft'

type SheetView = NonNullable<FunctionReturnType<typeof api.gmSheets.getSheet>>
type LinkSummary = SheetView['links'][number]
type Draft = {
  kind: GmSheetKind
  title: string
  summary: string
  body: string
  fields: { label: string; value: string }[]
}

function draftOf(view: SheetView): Draft {
  return {
    kind: view.sheet.kind,
    title: view.sheet.title,
    summary: view.sheet.summary,
    body: view.body,
    fields: view.fields,
  }
}

export function Sheet({ sheetId }: { sheetId: string }) {
  const view = useQuery(api.gmSheets.getSheet, { id: sheetId })
  if (view === undefined) return <p role="status">Chargement de la fiche…</p>
  if (!view) return <p role="alert">Fiche introuvable ou inaccessible.</p>
  return <SheetContent key={view.sheet._id} view={view} />
}

function SheetContent({ view }: { view: SheetView }) {
  const { sheet } = view
  const update = useMutation(api.gmSheets.updateSheet)
  const trash = useMutation(api.gmSheets.trashSheet)
  const navigate = useNavigate()
  // Le brouillon part de la version lue ; il ne suit le serveur que tant
  // qu'il n'a pas été modifié, pour ne jamais écraser une saisie en cours.
  const [base, setBase] = useState({
    version: sheet.version,
    draft: draftOf(view),
  })
  const [draft, setDraft] = useState<Draft>(base.draft)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(base.draft)
  const synced = reconcileDraft(
    { base, draft, saving },
    { version: sheet.version, draft: draftOf(view) }
  )
  if (synced) {
    setBase(synced)
    setDraft(synced.draft)
  }
  const deleted = sheet.deletedAt !== undefined

  const save = async () => {
    setSaving(true)
    setError(null)
    try {
      const submitted = draft
      const version = await update({
        id: sheet._id,
        expectedVersion: base.version,
        ...submitted,
      })
      setBase({ version, draft: submitted })
      setConflict(false)
    } catch (error_) {
      if (convexErrorCode(error_) === 'CONFLICT') setConflict(true)
      setError(operationErrorMessage(error_))
    } finally {
      setSaving(false)
    }
  }
  const loadSaved = () => {
    const next = { version: sheet.version, draft: draftOf(view) }
    setBase(next)
    setDraft(next.draft)
    setConflict(false)
    setError(null)
  }
  const setField = (index: number, patch: Partial<Draft['fields'][number]>) =>
    setDraft({
      ...draft,
      fields: draft.fields.map((field, i) =>
        i === index ? { ...field, ...patch } : field
      ),
    })
  const moveField = (index: number, offset: number) => {
    const fields = [...draft.fields]
    const [field] = fields.splice(index, 1)
    if (!field) return
    fields.splice(index + offset, 0, field)
    setDraft({ ...draft, fields })
  }

  return (
    <>
      <DraftGuard dirty={dirty} />
      <Link
        to="/app/projects/$projectId/library"
        params={{ projectId: sheet.projectId }}
        className="quiet-link"
      >
        ← Bibliothèque
      </Link>
      <div className="page-heading mt-5">
        <div>
          <p className="eyebrow">{gmSheetKindLabels[sheet.kind]}</p>
          <h1>{sheet.title}</h1>
          {deleted && (
            <p role="status">
              Cette fiche est dans la corbeille. Restaurez-la depuis la
              bibliothèque pour la modifier.
            </p>
          )}
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <form
          className="panel grid content-start gap-4 p-5"
          aria-label="Contenu de la fiche"
          onSubmit={(event) => {
            event.preventDefault()
            void save()
          }}
        >
          <fieldset disabled={deleted} className="grid gap-4">
            <label className="grid gap-1">
              <span>Titre</span>
              <input
                className="rounded border bg-background p-2"
                value={draft.title}
                required
                maxLength={120}
                onChange={(event) =>
                  setDraft({ ...draft, title: event.target.value })
                }
              />
            </label>
            <label className="grid gap-1">
              <span>Type</span>
              <select
                className="rounded border bg-background p-2"
                value={draft.kind}
                onChange={(event) =>
                  setDraft({
                    ...draft,
                    kind: gmSheetKindOf(event.target.value) ?? draft.kind,
                  })
                }
              >
                {gmSheetKinds.map((value) => (
                  <option key={value} value={value}>
                    {gmSheetKindLabels[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1">
              <span>Résumé</span>
              <input
                className="rounded border bg-background p-2"
                value={draft.summary}
                maxLength={500}
                onChange={(event) =>
                  setDraft({ ...draft, summary: event.target.value })
                }
              />
            </label>
            <label className="grid gap-1">
              <span>Description</span>
              <textarea
                className="min-h-48 rounded border bg-background p-2"
                value={draft.body}
                maxLength={50_000}
                onChange={(event) =>
                  setDraft({ ...draft, body: event.target.value })
                }
              />
            </label>
            <fieldset className="grid gap-3">
              <legend className="font-semibold">Champs</legend>
              {draft.fields.map((field, index) => (
                <div
                  key={index}
                  className="grid gap-2 sm:grid-cols-[12rem_1fr_auto]"
                >
                  <input
                    aria-label={`Nom du champ ${index + 1}`}
                    className="rounded border bg-background p-2"
                    value={field.label}
                    required
                    maxLength={60}
                    onChange={(event) =>
                      setField(index, { label: event.target.value })
                    }
                  />
                  <input
                    aria-label={`Valeur du champ ${index + 1}`}
                    className="rounded border bg-background p-2"
                    value={field.value}
                    maxLength={2000}
                    onChange={(event) =>
                      setField(index, { value: event.target.value })
                    }
                  />
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Monter le champ ${index + 1}`}
                      disabled={index === 0}
                      onClick={() => moveField(index, -1)}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Descendre le champ ${index + 1}`}
                      disabled={index === draft.fields.length - 1}
                      onClick={() => moveField(index, 1)}
                    >
                      ↓
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      aria-label={`Retirer le champ ${index + 1}`}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          fields: draft.fields.filter((_, i) => i !== index),
                        })
                      }
                    >
                      ×
                    </Button>
                  </div>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                disabled={draft.fields.length >= GM_MAX_SHEET_FIELDS}
                onClick={() =>
                  setDraft({
                    ...draft,
                    fields: [...draft.fields, { label: 'Champ', value: '' }],
                  })
                }
              >
                Ajouter un champ
              </Button>
            </fieldset>
          </fieldset>
          {error && (
            <p className="field-error" role="alert">
              {error}
            </p>
          )}
          {conflict && (
            <Button type="button" variant="outline" onClick={loadSaved}>
              Charger la version enregistrée
            </Button>
          )}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={deleted || saving || !dirty}>
              {saving ? 'Enregistrement…' : 'Enregistrer la fiche'}
            </Button>
            <Button
              type="button"
              variant="ghost"
              disabled={deleted}
              onClick={() =>
                void trash({ id: sheet._id })
                  .then(() =>
                    navigate({
                      to: '/app/projects/$projectId/library',
                      params: { projectId: sheet.projectId },
                    })
                  )
                  .catch((error_: unknown) =>
                    setError(operationErrorMessage(error_))
                  )
              }
            >
              Mettre à la corbeille
            </Button>
          </div>
        </form>
        <aside className="grid content-start gap-6">
          <SheetLinks view={view} disabled={deleted} />
          <section className="panel grid gap-2 p-5" aria-label="Rétroliens">
            <h2 className="font-semibold">Citée par</h2>
            {view.backlinks.length === 0 && (
              <p className="text-muted-foreground">Aucune fiche ne la cite.</p>
            )}
            {view.backlinks.map((linked) => (
              <LinkedSheet key={linked._id} sheet={linked} />
            ))}
          </section>
        </aside>
      </div>
    </>
  )
}

function LinkedSheet({ sheet }: { sheet: LinkSummary }) {
  return (
    <Link
      to="/app/sheets/$sheetId"
      params={{ sheetId: sheet._id }}
      className="quiet-link"
    >
      {gmSheetKindLabels[sheet.kind]} · {sheet.title}
    </Link>
  )
}

function SheetLinks({
  view,
  disabled,
}: {
  view: SheetView
  disabled: boolean
}) {
  const addLink = useMutation(api.gmSheets.addSheetLink)
  const removeLink = useMutation(api.gmSheets.removeSheetLink)
  const [search, setSearch] = useState('')
  const [error, setError] = useState<string | null>(null)
  const results = useQuery(
    api.gmSheets.searchSheets,
    search.trim() ? { projectId: view.sheet.projectId, text: search } : 'skip'
  )
  const current = view.links.map((link) => link._id)
  const run = async (action: () => Promise<unknown>) => {
    setError(null)
    try {
      await action()
      setSearch('')
    } catch (error_) {
      setError(operationErrorMessage(error_))
    }
  }
  return (
    <section className="panel grid gap-3 p-5" aria-label="Liens">
      <h2 className="font-semibold">Liens</h2>
      {view.links.length === 0 && (
        <p className="text-muted-foreground">Aucun lien.</p>
      )}
      {view.links.map((linked) => (
        <div
          key={linked._id}
          className="flex items-center justify-between gap-2"
        >
          <LinkedSheet sheet={linked} />
          <Button
            variant="ghost"
            disabled={disabled}
            aria-label={`Retirer le lien vers ${linked.title}`}
            onClick={() =>
              void run(() =>
                removeLink({ id: view.sheet._id, target: linked._id })
              )
            }
          >
            ×
          </Button>
        </div>
      ))}
      <label className="grid gap-1">
        <span>Relier une fiche</span>
        <input
          type="search"
          className="rounded border bg-background p-2"
          value={search}
          maxLength={100}
          disabled={disabled || current.length >= GM_MAX_SHEET_LINKS}
          onChange={(event) => setSearch(event.target.value)}
        />
      </label>
      {results
        ?.filter(
          (result) =>
            result._id !== view.sheet._id && !current.includes(result._id)
        )
        .map((result) => (
          <Button
            key={result._id}
            variant="outline"
            className="justify-start"
            onClick={() =>
              void run(() =>
                addLink({ id: view.sheet._id, target: result._id })
              )
            }
          >
            Relier « {result.title} »
          </Button>
        ))}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </section>
  )
}
