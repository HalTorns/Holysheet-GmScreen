// Formules des variables de projet (F2) : grammaire arithmétique bornée,
// analysée et évaluée sans eval ni moteur de script. Partagé client/serveur.

export const FORMULA_MAX_LENGTH = 500
export const FORMULA_MAX_DEPTH = 32
const FORMULA_MAX_NODES = 200

const functions = {
  min: (args: number[]) => Math.min(...args),
  max: (args: number[]) => Math.max(...args),
  abs: (args: number[]) => Math.abs(args[0] ?? Number.NaN),
  floor: (args: number[]) => Math.floor(args[0] ?? Number.NaN),
  ceil: (args: number[]) => Math.ceil(args[0] ?? Number.NaN),
  round: (args: number[]) => Math.round(args[0] ?? Number.NaN),
} as const
type FunctionName = keyof typeof functions
const functionNames = Object.keys(functions).filter(
  (name): name is FunctionName => name in functions
)
const unary = new Set<FunctionName>(['abs', 'floor', 'ceil', 'round'])

type FormulaNode =
  | { type: 'number'; value: number }
  | { type: 'ref'; name: string }
  | { type: 'neg'; operand: FormulaNode }
  | {
      type: 'binary'
      op: '+' | '-' | '*' | '/' | '%'
      left: FormulaNode
      right: FormulaNode
    }
  | { type: 'call'; name: FunctionName; args: FormulaNode[] }

type FormulaParseError = {
  code:
    | 'TOO_LONG'
    | 'TOO_DEEP'
    | 'TOO_COMPLEX'
    | 'UNEXPECTED_CHARACTER'
    | 'UNEXPECTED_TOKEN'
    | 'UNEXPECTED_END'
    | 'UNKNOWN_FUNCTION'
    | 'WRONG_ARITY'
    | 'EMPTY'
  position: number
}

export type FormulaParseResult =
  | { ok: true; node: FormulaNode; dependencies: string[] }
  | { ok: false; error: FormulaParseError }

type Token =
  | { kind: 'number'; value: number; position: number }
  | { kind: 'ident'; value: string; position: number }
  | { kind: 'op'; value: string; position: number }
  | { kind: 'end'; position: number }

type EvaluationCode = Extract<ComputedValue, { error: string }>['error']

class FormulaFailureError extends Error {
  override name = 'FormulaFailureError'
  constructor(
    readonly parse?: FormulaParseError,
    readonly evaluation?: EvaluationCode
  ) {
    super(parse?.code ?? evaluation)
  }
}

function fail(code: FormulaParseError['code'], position: number): never {
  throw new FormulaFailureError({ code, position })
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index] ?? ''
    if (/\s/.test(char)) {
      index++
      continue
    }
    const number = /^(?:\d+(?:\.\d+)?|\.\d+)/.exec(source.slice(index))
    if (number) {
      tokens.push({ kind: 'number', value: Number(number[0]), position: index })
      index += number[0].length
      continue
    }
    const ident = /^[A-Za-z_][A-Za-z0-9_]*/.exec(source.slice(index))
    if (ident) {
      tokens.push({ kind: 'ident', value: ident[0], position: index })
      index += ident[0].length
      continue
    }
    if ('+-*/%(),'.includes(char)) {
      tokens.push({ kind: 'op', value: char, position: index })
      index++
      continue
    }
    fail('UNEXPECTED_CHARACTER', index)
  }
  tokens.push({ kind: 'end', position: source.length })
  return tokens
}

export function normalizeName(name: string) {
  return name.toLowerCase()
}

export function parseFormula(source: string): FormulaParseResult {
  if (source.length > FORMULA_MAX_LENGTH)
    return {
      ok: false,
      error: { code: 'TOO_LONG', position: FORMULA_MAX_LENGTH },
    }
  if (!source.trim())
    return { ok: false, error: { code: 'EMPTY', position: 0 } }
  try {
    const tokens = tokenize(source)
    let cursor = 0
    let nodes = 0
    const dependencies = new Set<string>()
    const peek = () =>
      tokens[cursor] ?? { kind: 'end' as const, position: source.length }
    const advance = () => {
      const token = peek()
      cursor++
      return token
    }
    const isOp = (value: string) => {
      const token = peek()
      return token.kind === 'op' && token.value === value
    }
    const expectOp = (value: string) => {
      const token = advance()
      if (token.kind !== 'op' || token.value !== value)
        fail(
          token.kind === 'end' ? 'UNEXPECTED_END' : 'UNEXPECTED_TOKEN',
          token.position
        )
    }
    const count = (position: number) => {
      nodes++
      if (nodes > FORMULA_MAX_NODES) fail('TOO_COMPLEX', position)
    }
    const expression = (depth: number): FormulaNode => {
      if (depth > FORMULA_MAX_DEPTH) fail('TOO_DEEP', peek().position)
      let left = term(depth)
      while (isOp('+') || isOp('-')) {
        const token = advance()
        count(token.position)
        left = {
          type: 'binary',
          op: token.kind === 'op' && token.value === '-' ? '-' : '+',
          left,
          right: term(depth),
        }
      }
      return left
    }
    const term = (depth: number): FormulaNode => {
      let left = factor(depth)
      while (isOp('*') || isOp('/') || isOp('%')) {
        const token = advance()
        count(token.position)
        const op =
          token.kind === 'op' && (token.value === '/' || token.value === '%')
            ? token.value
            : '*'
        left = { type: 'binary', op, left, right: factor(depth) }
      }
      return left
    }
    const factor = (depth: number): FormulaNode => {
      if (depth > FORMULA_MAX_DEPTH) fail('TOO_DEEP', peek().position)
      const token = advance()
      count(token.position)
      if (token.kind === 'number') return { type: 'number', value: token.value }
      if (token.kind === 'op' && token.value === '-')
        return { type: 'neg', operand: factor(depth + 1) }
      if (token.kind === 'op' && token.value === '+') return factor(depth + 1)
      if (token.kind === 'op' && token.value === '(') {
        const inner = expression(depth + 1)
        expectOp(')')
        return inner
      }
      if (token.kind === 'ident') {
        if (!isOp('(')) {
          dependencies.add(normalizeName(token.value))
          return { type: 'ref', name: normalizeName(token.value) }
        }
        const fn = functionNames.find(
          (candidate) => candidate === token.value.toLowerCase()
        )
        if (!fn) return fail('UNKNOWN_FUNCTION', token.position)
        advance()
        const args: FormulaNode[] = []
        if (!isOp(')')) {
          args.push(expression(depth + 1))
          while (isOp(',')) {
            advance()
            args.push(expression(depth + 1))
          }
        }
        expectOp(')')
        if (unary.has(fn) ? args.length !== 1 : args.length === 0)
          fail('WRONG_ARITY', token.position)
        return { type: 'call', name: fn, args }
      }
      return fail(
        token.kind === 'end' ? 'UNEXPECTED_END' : 'UNEXPECTED_TOKEN',
        token.position
      )
    }
    const node = expression(0)
    const rest = peek()
    if (rest.kind !== 'end') fail('UNEXPECTED_TOKEN', rest.position)
    return { ok: true, node, dependencies: [...dependencies] }
  } catch (error) {
    if (error instanceof FormulaFailureError && error.parse)
      return { ok: false, error: error.parse }
    throw error
  }
}

export type VariableDefinition =
  | { type: 'number'; value: number }
  | { type: 'text'; value: string }
  | { type: 'boolean'; value: boolean }
  | { type: 'formula'; expression: string }

export type ComputedValue =
  | { value: number | string | boolean }
  | {
      error:
        | 'DIVISION_BY_ZERO'
        | 'UNKNOWN_VARIABLE'
        | 'NOT_A_NUMBER'
        | 'CYCLE'
        | 'NON_FINITE'
        | 'DEPENDENCY_ERROR'
        | 'INVALID_FORMULA'
    }

// Évalue toutes les variables d'un projet (au plus quelques centaines) avec
// mémoïsation ; un cycle déjà présent en base est rapporté, jamais suivi.
export function evaluateProject(
  variables: { name: string; definition: VariableDefinition }[]
): Map<string, ComputedValue> {
  const byName = new Map(
    variables.map((v) => [normalizeName(v.name), v.definition])
  )
  const results = new Map<string, ComputedValue>()
  const visiting = new Set<string>()
  const resolve = (name: string): ComputedValue => {
    const known = results.get(name)
    if (known) return known
    const definition = byName.get(name)
    if (!definition) return { error: 'UNKNOWN_VARIABLE' }
    if (definition.type !== 'formula') {
      const result = { value: definition.value }
      results.set(name, result)
      return result
    }
    if (visiting.has(name)) return { error: 'CYCLE' }
    visiting.add(name)
    let result: ComputedValue
    const parsed = parseFormula(definition.expression)
    if (parsed.ok)
      try {
        result = { value: evaluate(parsed.node) }
      } catch (error) {
        if (!(error instanceof FormulaFailureError) || !error.evaluation)
          throw error
        result = { error: error.evaluation }
      }
    else result = { error: 'INVALID_FORMULA' }
    visiting.delete(name)
    results.set(name, result)
    return result
  }
  const evaluate = (node: FormulaNode): number => {
    if (node.type === 'number') return node.value
    if (node.type === 'neg') return -evaluate(node.operand)
    if (node.type === 'call')
      return finite(functions[node.name](node.args.map(evaluate)))
    if (node.type === 'ref') {
      const target = resolve(node.name)
      if ('error' in target)
        throw new FormulaFailureError(
          undefined,
          target.error === 'UNKNOWN_VARIABLE' || target.error === 'CYCLE'
            ? target.error
            : 'DEPENDENCY_ERROR'
        )
      if (typeof target.value !== 'number')
        throw new FormulaFailureError(undefined, 'NOT_A_NUMBER')
      return target.value
    }
    const left = evaluate(node.left)
    const right = evaluate(node.right)
    if ((node.op === '/' || node.op === '%') && right === 0)
      throw new FormulaFailureError(undefined, 'DIVISION_BY_ZERO')
    return finite(binaryOperators[node.op](left, right))
  }
  for (const name of byName.keys()) resolve(name)
  return results
}

const binaryOperators = {
  '+': (left: number, right: number) => left + right,
  '-': (left: number, right: number) => left - right,
  '*': (left: number, right: number) => left * right,
  '/': (left: number, right: number) => left / right,
  '%': (left: number, right: number) => left % right,
} as const

function finite(value: number) {
  if (!Number.isFinite(value))
    throw new FormulaFailureError(undefined, 'NON_FINITE')
  return value
}

// Détecte un cycle dans le graphe formule → dépendances (noms normalisés).
export function findCycle(graph: Map<string, string[]>): string[] | null {
  const state = new Map<string, 'visiting' | 'done'>()
  const path: string[] = []
  const visit = (name: string): string[] | null => {
    const current = state.get(name)
    if (current === 'done') return null
    if (current === 'visiting') return [...path.slice(path.indexOf(name)), name]
    state.set(name, 'visiting')
    path.push(name)
    for (const dependency of graph.get(name) ?? []) {
      const cycle = visit(dependency)
      if (cycle) return cycle
    }
    path.pop()
    state.set(name, 'done')
    return null
  }
  for (const name of graph.keys()) {
    const cycle = visit(name)
    if (cycle) return cycle
  }
  return null
}
