import type { VariableDefinition } from '../../../shared/formula'

// Une saisie numérique vide ne représente jamais zéro.
export function definitionFrom(
  type: VariableDefinition['type'],
  input: string
): { definition: VariableDefinition } | { error: string } {
  if (type === 'number') {
    if (!input.trim() || !Number.isFinite(Number(input)))
      return { error: 'Saisissez un nombre fini.' }
    return { definition: { type, value: Number(input) } }
  }
  if (type === 'text') return { definition: { type, value: input } }
  if (type === 'boolean')
    return { definition: { type, value: input === 'true' } }
  return { definition: { type, expression: input } }
}
