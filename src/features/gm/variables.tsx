import { api } from '@convex/_generated/api'
import type { Doc, Id } from '@convex/_generated/dataModel'
import { Link } from '@tanstack/react-router'
import { useMutation, useQuery } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { convexErrorCode, operationErrorMessage } from '@/features/auth/errors'

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

// Valeur saisie sous forme de texte, convertie selon le type.
function definitionFrom(type: VariableType, input: string) {
  if (type === 'number') return { type, value: Number(input) } as const
  if (type === 'text') return { type, value: input } as const
  if (type === 'boolean') return { type, value: input === 'true' } as const
  return { type, expression: input } as const
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

export function Variables({ projectId }: { projectId: string }) {
  const project = useQuery(api.gm.getProject, { id: projectId })
  if (project === undefined)
    return <p role="status">Chargement des variables…</p>
  if (!project) return <p role="alert">Projet introuvable ou inaccessible.</p>
  return <VariablesContent project={project} />
}

function VariablesContent({ project }: { project: Doc<'gmProjects'> }) {
  const rows = useQuery(api.gmVariables.listVariables, {
    projectId: project._id,
  })
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
                  <VariableRow
                    key={`${row.variable._id}-${row.variable.version}`}
                    row={row}
                  />
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
        setPending(true)
        setError(null)
        create({
          projectId,
          name,
          label,
          definition: definitionFrom(type, input),
        })
          .then(() => {
            setName('')
            setLabel('')
            setInput(type === 'number' ? '0' : '')
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
            const next = variableTypeOf(event.target.value)
            setType(next)
            setInput(
              next === 'number' ? '0' : next === 'boolean' ? 'false' : ''
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
  const setValue = useMutation(api.gmVariables.setVariableValue)
  const update = useMutation(api.gmVariables.updateVariable)
  const remove = useMutation(api.gmVariables.deleteVariable)
  const initial = inputOf(variable)
  const [input, setInput] = useState(initial)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const run = (action: () => Promise<unknown>) => {
    setError(null)
    action().catch((error_: unknown) => setError(variableError(error_)))
  }
  const save = () =>
    run(() => {
      const definition = definitionFrom(variable.type, input)
      if (definition.type === 'formula')
        return update({
          id: variable._id,
          expectedVersion: variable.version,
          name: variable.name,
          label: variable.label,
          definition,
        })
      return setValue({ id: variable._id, value: definition.value })
    })
  return (
    <tr className="border-t align-top">
      <th scope="row" className="py-2 pr-3 font-mono">
        {variable.name}
        {variable.label && (
          <span className="block font-sans text-xs text-muted-foreground">
            {variable.label}
          </span>
        )}
      </th>
      <td className="py-2 pr-3">{typeLabels[variable.type]}</td>
      <td className="py-2 pr-3">
        <ValueInput
          type={variable.type}
          value={input}
          label={`Valeur de ${variable.name}`}
          onChange={setInput}
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
          disabled={input === initial}
          onClick={save}
          aria-label={`Enregistrer ${variable.name}`}
        >
          Enregistrer
        </Button>
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
