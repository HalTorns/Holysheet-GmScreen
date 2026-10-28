import type { Infer } from 'convex/values'
import { ConvexError, v } from 'convex/values'

import type { VariableDefinition } from '../shared/formula'
import {
  evaluateProject,
  findCycle,
  normalizeName,
  parseFormula,
} from '../shared/formula'
import {
  GM_MAX_VARIABLES,
  gmVariableLabel,
  gmVariableName,
  gmVariableText,
} from '../shared/gm'
import type { Doc, Id } from './_generated/dataModel'
import type { QueryCtx } from './_generated/server'
import { mutation, query } from './_generated/server'
import { requireUser } from './lib/auth'
import { ownedProject, ownedVariable } from './lib/gmAccess'
import {
  variableDefinitionValidator,
  variableValidator,
} from './lib/gmValidators'
import { limitUserOperation } from './lib/rateLimits'

type DefinitionInput = Infer<typeof variableDefinitionValidator>
type StoredDefinition =
  | { type: 'number'; value: number; min?: number; max?: number }
  | { type: 'text'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'formula'; expression: string; dependencies: string[] }

const computedValidator = v.union(
  v.object({ value: v.union(v.number(), v.string(), v.boolean()) }),
  v.object({ error: v.string() })
)

function invalid(code = 'INVALID_INPUT'): never {
  throw new ConvexError({ code })
}

// Les variables d'un projet sont petites (< 3 ko) et bornées à 200 : elles
// sont toutes lues dans la transaction pour les cycles et les références.
function projectVariables(ctx: QueryCtx, projectId: Id<'gmProjects'>) {
  return ctx.db
    .query('gmVariables')
    .withIndex('by_project', (q) => q.eq('projectId', projectId))
    .take(GM_MAX_VARIABLES + 1)
}

function validName(name: string) {
  const parsed = gmVariableName.safeParse(name)
  if (!parsed.success) invalid()
  return parsed.data
}

function validLabel(label: string) {
  const parsed = gmVariableLabel.safeParse(label)
  if (!parsed.success) invalid()
  return parsed.data
}

function storedDefinition(input: DefinitionInput): StoredDefinition {
  if (input.type === 'number') {
    const { value, min, max } = input
    const bounds = [value, min, max].filter((n) => n !== undefined)
    if (!bounds.every((n) => Number.isFinite(n))) invalid()
    if (min !== undefined && max !== undefined && min > max) invalid()
    if (
      (min !== undefined && value < min) ||
      (max !== undefined && value > max)
    )
      invalid('OUT_OF_RANGE')
    return {
      type: 'number',
      value,
      ...(min === undefined ? {} : { min }),
      ...(max === undefined ? {} : { max }),
    }
  }
  if (input.type === 'text') {
    if (!gmVariableText.safeParse(input.value).success) invalid()
    return input
  }
  if (input.type === 'boolean') return input
  const parsed = parseFormula(input.expression)
  if (!parsed.ok)
    throw new ConvexError({
      code: 'INVALID_FORMULA',
      position: parsed.error.position,
      reason: parsed.error.code,
    })
  return {
    type: 'formula',
    expression: input.expression,
    dependencies: parsed.dependencies,
  }
}

function definitionOf(variable: Doc<'gmVariables'>): StoredDefinition {
  if (variable.type === 'number')
    return {
      type: 'number',
      value: variable.value,
      ...(variable.min === undefined ? {} : { min: variable.min }),
      ...(variable.max === undefined ? {} : { max: variable.max }),
    }
  if (variable.type === 'text') return { type: 'text', value: variable.value }
  if (variable.type === 'boolean')
    return { type: 'boolean', value: variable.value }
  return {
    type: 'formula',
    expression: variable.expression,
    dependencies: variable.dependencies,
  }
}

// Refuse une écriture qui créerait un cycle : le graphe est reconstruit avec
// la variable candidate à la place de son ancienne version.
function assertNoCycle(
  variables: Doc<'gmVariables'>[],
  candidate: {
    id?: Id<'gmVariables'>
    nameKey: string
    definition: StoredDefinition
  }
) {
  const graph = new Map<string, string[]>()
  for (const variable of variables)
    if (variable._id !== candidate.id && variable.type === 'formula')
      graph.set(variable.nameKey, variable.dependencies)
  if (candidate.definition.type === 'formula')
    graph.set(candidate.nameKey, candidate.definition.dependencies)
  else graph.delete(candidate.nameKey)
  if (findCycle(graph)) invalid('CYCLE')
}

function assertNotReferenced(
  variables: Doc<'gmVariables'>[],
  nameKey: string,
  except: Id<'gmVariables'>
) {
  if (
    variables.some(
      (variable) =>
        variable._id !== except &&
        variable.type === 'formula' &&
        variable.dependencies.includes(nameKey)
    )
  )
    invalid('REFERENCED')
}

export const listVariables = query({
  args: { projectId: v.id('gmProjects') },
  returns: v.array(
    v.object({ variable: variableValidator, computed: computedValidator })
  ),
  handler: async (ctx, { projectId }) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, projectId, user._id)
    const variables = (await projectVariables(ctx, projectId)).slice(
      0,
      GM_MAX_VARIABLES
    )
    const results = evaluateProject(
      variables.map((variable) => ({
        name: variable.nameKey,
        definition: definitionOf(variable) as VariableDefinition,
      }))
    )
    return [...variables]
      .sort((a, b) => a.nameKey.localeCompare(b.nameKey))
      .map((variable) => ({
        variable,
        computed: results.get(variable.nameKey) ?? {
          error: 'UNKNOWN_VARIABLE',
        },
      }))
  },
})

export const createVariable = mutation({
  args: {
    projectId: v.id('gmProjects'),
    name: v.string(),
    label: v.string(),
    definition: variableDefinitionValidator,
  },
  returns: v.id('gmVariables'),
  handler: async (ctx, { projectId, name, label, definition }) => {
    const user = await requireUser(ctx)
    await ownedProject(ctx, projectId, user._id)
    const validNameValue = validName(name)
    const nameKey = normalizeName(validNameValue)
    const stored = storedDefinition(definition)
    const variables = await projectVariables(ctx, projectId)
    if (variables.length >= GM_MAX_VARIABLES) invalid('VARIABLE_LIMIT')
    if (variables.some((variable) => variable.nameKey === nameKey))
      invalid('NAME_TAKEN')
    assertNoCycle(variables, { nameKey, definition: stored })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    return ctx.db.insert('gmVariables', {
      ownerId: user._id,
      projectId,
      updatedAt: Date.now(),
      name: validNameValue,
      nameKey,
      label: validLabel(label),
      version: 0,
      ...stored,
    })
  },
})

export const updateVariable = mutation({
  args: {
    id: v.id('gmVariables'),
    expectedVersion: v.number(),
    name: v.string(),
    label: v.string(),
    definition: variableDefinitionValidator,
  },
  returns: v.number(),
  handler: async (ctx, { id, expectedVersion, name, label, definition }) => {
    const user = await requireUser(ctx)
    const current = await ownedVariable(ctx, id, user._id)
    const validNameValue = validName(name)
    const nameKey = normalizeName(validNameValue)
    const stored = storedDefinition(definition)
    const validLabelValue = validLabel(label)
    if (current.version !== expectedVersion) invalid('CONFLICT')
    const variables = await projectVariables(ctx, current.projectId)
    if (nameKey !== current.nameKey) {
      if (variables.some((variable) => variable.nameKey === nameKey))
        invalid('NAME_TAKEN')
      assertNotReferenced(variables, current.nameKey, id)
    }
    assertNoCycle(variables, { id, nameKey, definition: stored })
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    const version = current.version + 1
    // Remplacement complet : les champs propres à l'ancien type disparaissent.
    await ctx.db.replace('gmVariables', id, {
      ownerId: current.ownerId,
      projectId: current.projectId,
      updatedAt: Date.now(),
      name: validNameValue,
      nameKey,
      label: validLabelValue,
      version,
      ...stored,
    })
    return version
  },
})

export const setVariableValue = mutation({
  args: {
    id: v.id('gmVariables'),
    value: v.union(v.number(), v.string(), v.boolean()),
  },
  returns: v.number(),
  handler: async (ctx, { id, value }) => {
    const user = await requireUser(ctx)
    const current = await ownedVariable(ctx, id, user._id)
    let stored: StoredDefinition
    if (current.type === 'number' && typeof value === 'number')
      stored = storedDefinition({
        type: 'number',
        value,
        ...(current.min === undefined ? {} : { min: current.min }),
        ...(current.max === undefined ? {} : { max: current.max }),
      })
    else if (current.type === 'text' && typeof value === 'string')
      stored = storedDefinition({ type: 'text', value })
    else if (current.type === 'boolean' && typeof value === 'boolean')
      stored = { type: 'boolean', value }
    else invalid()
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    // Sans expectedVersion, mais la version avance : un éditeur resté sur
    // l'ancienne version reçoit CONFLICT (review F2-01).
    const version = current.version + 1
    await ctx.db.patch('gmVariables', id, {
      value: 'value' in stored ? stored.value : value,
      version,
      updatedAt: Date.now(),
    })
    return version
  },
})

export const deleteVariable = mutation({
  args: { id: v.id('gmVariables') },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const user = await requireUser(ctx)
    const current = await ownedVariable(ctx, id, user._id)
    const variables = await projectVariables(ctx, current.projectId)
    assertNotReferenced(variables, current.nameKey, id)
    await limitUserOperation(ctx, 'resourceWrite', user._id)
    await ctx.db.delete('gmVariables', id)
    return null
  },
})
