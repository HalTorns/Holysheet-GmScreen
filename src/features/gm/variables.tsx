import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { convexErrorCode, operationErrorMessage } from '@/features/auth/errors'

import { reconcileDraft } from './sheet-draft'
import { definitionFrom } from './variable-input'

type Row = FunctionReturnType<typeof api.gmVariables.listVariables>[number]
type VariableType = Doc<'gmVariables'>['type']

const typeLabels: Record<VariableType, string> = {
  number: 'Nombre',
  text: 'Texte',
  boolean: 'Oui/non',
  formula: 'Formule',
}

const computedErrors: Record<string, string> = {
  DIVISION_BY_ZERO: 'Division par zéro',
  UNKNOWN_VARIABLE: 'Variable inconnue',
  NOT_A_NUMBER: 'Référence non numérique',
  CYCLE: 'Dépendance circulaire',
  NON_FINITE: 'Résultat hors limites',
  DEPENDENCY_ERROR: 'Une dépendance est en erreur',
  INVALID_FORMULA: 'Formule invalide',
}

function variableTypeOf(value: string): VariableType {
  const types: VariableType[] = ['number', 'text', 'boolean', 'formula']
  return types.find((type) => type === value) ?? 'number'
}

function inputOf(variable: Doc<'gmVariables'>) {
  if (variable.type === 'formula') return variable.expression
  return String(variable.value)
}

function formatComputed(computed: Row['computed']) {
  if ('error' in computed)
    return computedErrors[computed.error] ?? 'Erreur de calcul'
  if (typeof computed.value === 'boolean') return computed.value ? 'Oui' : 'Non'
  return String(computed.value)
}

// Convex peut repasser une requête à undefined le temps de confirmer un jeton
// rafraîchi : garder la dernière réponse évite de remonter les lignes et de
// perdre un brouillon en cours de saisie. Le composant est clé par projet.
function useRetained<T>(value: T | undefined) {
  const [kept, setKept] = useState(value)
  if (value !== undefined && value !== kept) setKept(value)
  return value ?? kept
}

export function Variables({ projectId }: { projectId: string }) {
  const project = useRetained(useQuery(api.gm.getProject, { id: projectId }))
  if (project === undefined)
    return <p role="status">Chargement des variables…</p>
  if (!project) return <p role="alert">Projet introuvable ou inaccessible.</p>
  return <VariablesContent project={project} />
}

function VariablesContent({ project }: { project: Doc<'gmProjects'> }) {
  const rows = useRetained(
    useQuery(api.gmVariables.listVariables, { projectId: project._id })
  )
  return (
    <>
      <Link
        to="/app/projects/$projectId"
        params={{ projectId: project._id }}
        className="quiet-link"
      >
        ← {project.title}
      </Link>
      <div className="page-heading mt-5">
        <div>
          <p className="eyebrow">VARIABLES</p>
          <h1>Variables du projet</h1>
          <p>
            Valeurs partagées et formules recalculées automatiquement, par
            exemple <code>bonus = force * 2 + 1</code>.
          </p>
        </div>
      </div>
      <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
        <CreateVariable projectId={project._id} />
        <section aria-label="Variables" className="panel overflow-x-auto p-5">
          {rows === undefined ? (
            <p role="status">Chargement des variables…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground">
              Aucune variable pour l’instant.
            </p>
          ) : (
            <table className="w-full text-left text-sm">
              <thead>
                <tr>
                  <th scope="col">Nom</th>
                  <th scope="col">Type</th>
                  <th scope="col">Valeur ou formule</th>
                  <th scope="col">Résultat</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <VariableRow key={row.variable._id} row={row} />
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </>
  )
}

function CreateVariable({ projectId }: { projectId: Id<'gmProjects'> }) {
  const create = useMutation(api.gmVariables.createVariable)
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [type, setType] = useState<VariableType>('number')
  const [input, setInput] = useState('0')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  return (
    <form
      className="panel grid content-start gap-3 p-5"
      aria-label="Nouvelle variable"
      onSubmit={(event) => {
        event.preventDefault()
        const converted = definitionFrom(type, input)
        if ('error' in converted) {
          setError(converted.error)
          return
        }
        setPending(true)
        setError(null)
        void create({
          projectId,
          name,
          label,
          definition: converted.definition,
        })
          .then(() => {
            setName('')
            setLabel('')
            setInput(type === 'number' ? '0' : '')
            return undefined
          })
          .catch((error_: unknown) => setError(variableError(error_)))
          .finally(() => setPending(false))
      }}
    >
      <label className="grid gap-1">
        <span>Nom de la variable</span>
        <input
          className="rounded border bg-background p-2 font-mono"
          value={name}
          required
          maxLength={40}
          pattern="[A-Za-z_][A-Za-z0-9_]*"
          onChange={(event) => setName(event.target.value)}
        />
      </label>
      <label className="grid gap-1">
        <span>Libellé</span>
        <input
          className="rounded border bg-background p-2"
          value={label}
          maxLength={120}
          onChange={(event) => setLabel(event.target.value)}
        />
      </label>
      <label className="grid gap-1">
        <span>Type</span>
        <select
          className="rounded border bg-background p-2"
          value={type}
          onChange={(event) => {
            const selectedType = variableTypeOf(event.target.value)
            setType(selectedType)
            setInput(
              selectedType === 'number'
                ? '0'
                : selectedType === 'boolean'
                  ? 'false'
                  : ''
            )
          }}
        >
          {Object.entries(typeLabels).map(([value, text]) => (
            <option key={value} value={value}>
              {text}
            </option>
          ))}
        </select>
      </label>
      <ValueInput
        type={type}
        value={input}
        label={type === 'formula' ? 'Formule' : 'Valeur'}
        onChange={setInput}
      />
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending}>
        Créer la variable
      </Button>
    </form>
  )
}

function ValueInput({
  type,
  value,
  label,
  onChange,
}: {
  type: VariableType
  value: string
  label: string
  onChange: (value: string) => void
}) {
  if (type === 'boolean')
    return (
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(event) => onChange(String(event.target.checked))}
        />
        <span>{label}</span>
      </label>
    )
  return (
    <label className="grid gap-1">
      <span className={label.startsWith('Valeur de') ? 'sr-only' : ''}>
        {label}
      </span>
      <input
        className={`rounded border bg-background p-2 ${type === 'formula' ? 'font-mono' : ''}`}
        type={type === 'number' ? 'number' : 'text'}
        step="any"
        value={value}
        maxLength={type === 'formula' ? 500 : 2000}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

function variableError(error: unknown) {
  const code = convexErrorCode(error)
  if (code === 'CYCLE')
    return 'Cette formule créerait une dépendance circulaire.'
  if (code === 'INVALID_FORMULA')
    return 'Formule invalide : vérifiez les opérateurs, les parenthèses et les fonctions (min, max, abs, floor, ceil, round).'
  if (code === 'NAME_TAKEN') return 'Une variable porte déjà ce nom.'
  if (code === 'REFERENCED')
    return 'Une formule utilise cette variable : modifiez d’abord cette formule.'
  if (code === 'OUT_OF_RANGE') return 'La valeur sort des bornes autorisées.'
  if (code === 'VARIABLE_LIMIT')
    return 'Ce projet a atteint sa limite de 200 variables.'
  return operationErrorMessage(error)
}

function VariableRow({ row }: { row: Row }) {
  const { variable, computed } = row
  const update = useMutation(api.gmVariables.updateVariable)
  const remove = useMutation(api.gmVariables.deleteVariable)
  const serverDraft = {
    name: variable.name,
    label: variable.label,
    input: inputOf(variable),
    type: variable.type,
    min: variable.type === 'number' ? variable.min : undefined,
    max: variable.type === 'number' ? variable.max : undefined,
  }
  const [base, setBase] = useState({
    version: variable.version,
    draft: serverDraft,
  })
  const [draft, setDraft] = useState(base.draft)
  const [saving, setSaving] = useState(false)
  const [conflict, setConflict] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const dirty = JSON.stringify(draft) !== JSON.stringify(base.draft)
  const synced = reconcileDraft(
    { base, draft, saving },
    { version: variable.version, draft: serverDraft }
  )
  if (synced) {
    setBase(synced)
    setDraft(synced.draft)
  }
  const run = (action: () => Promise<unknown>) => {
    setError(null)
    action().catch((error_: unknown) => setError(variableError(error_)))
  }
  const save = async () => {
    const converted = definitionFrom(draft.type, draft.input)
    if ('error' in converted) {
      setError(converted.error)
      return
    }
    setSaving(true)
    setError(null)
    const submitted = draft
    const definition = converted.definition
    try {
      const version = await update({
        id: variable._id,
        expectedVersion: base.version,
        name: submitted.name,
        label: submitted.label,
        definition:
          definition.type === 'number'
            ? {
                ...definition,
                ...(submitted.min === undefined ? {} : { min: submitted.min }),
                ...(submitted.max === undefined ? {} : { max: submitted.max }),
              }
            : definition,
      })
      setBase({ version, draft: submitted })
      setConflict(false)
    } catch (error_) {
      if (convexErrorCode(error_) === 'CONFLICT') setConflict(true)
      setError(variableError(error_))
    } finally {
      setSaving(false)
    }
  }
  const loadSaved = () => {
    setBase({ version: variable.version, draft: serverDraft })
    setDraft(serverDraft)
    setConflict(false)
    setError(null)
  }
  return (
    <tr className="border-t align-top">
      <th
        scope="row"
        aria-label={variable.name}
        className="py-2 pr-3 font-mono"
      >
        <label className="grid gap-1">
          <span className="sr-only">Nom de {variable.name}</span>
          <input
            className="rounded border bg-background p-2"
            value={draft.name}
            maxLength={40}
            onChange={(event) =>
              setDraft({ ...draft, name: event.target.value })
            }
          />
        </label>
        <label className="grid gap-1 font-sans">
          <span className="sr-only">Libellé de {variable.name}</span>
          <input
            className="rounded border bg-background p-2"
            value={draft.label}
            maxLength={120}
            onChange={(event) =>
              setDraft({ ...draft, label: event.target.value })
            }
          />
        </label>
      </th>
      <td className="py-2 pr-3">{typeLabels[variable.type]}</td>
      <td className="py-2 pr-3">
        <ValueInput
          type={draft.type}
          value={draft.input}
          label={`Valeur de ${variable.name}`}
          onChange={(input) => setDraft({ ...draft, input })}
        />
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
      </td>
      <td className="py-2 pr-3" aria-label={`Résultat de ${variable.name}`}>
        {formatComputed(computed)}
      </td>
      <td className="flex flex-wrap gap-1 py-2">
        <Button
          variant="outline"
          disabled={!dirty || saving || conflict}
          onClick={() => void save()}
          aria-label={`Enregistrer ${variable.name}`}
        >
          Enregistrer
        </Button>
        {conflict && (
          <Button variant="outline" disabled={saving} onClick={loadSaved}>
            Charger la version enregistrée
          </Button>
        )}
        {confirming ? (
          <Button
            variant="destructive"
            onClick={() => run(() => remove({ id: variable._id }))}
            aria-label={`Confirmer la suppression de ${variable.name}`}
          >
            Confirmer
          </Button>
        ) : (
          <Button
            variant="ghost"
            onClick={() => setConfirming(true)}
            aria-label={`Supprimer ${variable.name}`}
          >
            Supprimer
          </Button>
        )}
      </td>
    </tr>
  )
}
