import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

import ts from 'typescript'

// No imports or execution of application modules: only the compiler's AST/types.
const root = resolve(import.meta.dirname, '../..')
function filesIn(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === '_generated') return []
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesIn(path) : [path]
  })
}
const files = filesIn(join(root, 'convex')).filter((file) =>
  file.endsWith('.ts')
)
// A directory with convex.config.ts is an isolated component, not a client API.
const components = files
  .filter((file) => file.endsWith('/convex.config.ts'))
  .map(dirname)
  .filter((directory) => directory !== join(root, 'convex'))
const appFiles = files.filter(
  (file) => !components.some((directory) => file.startsWith(`${directory}/`))
)
const config = ts.readConfigFile(join(root, 'tsconfig.json'), (path) =>
  ts.sys.readFile(path)
)
if (config.error)
  throw new Error(
    ts.flattenDiagnosticMessageText(config.error.messageText, '\n')
  )
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root)
const program = ts.createProgram(appFiles, parsed.options)
const checker = program.getTypeChecker()
function symbolAt(node) {
  const symbol = checker.getSymbolAtLocation(node)
  return symbol && symbol.flags & ts.SymbolFlags.Alias
    ? checker.getAliasedSymbol(symbol)
    : symbol
}
function visit(node, apply) {
  apply(node)
  ts.forEachChild(node, (child) => visit(child, apply))
}
function location(node) {
  const source = node.getSourceFile()
  return `${relative(root, source.fileName)}:${source.getLineAndCharacterOfPosition(node.getStart()).line + 1}`
}
function evidence(node) {
  const auth = new Set()
  const access = new Set()
  const bounds = new Set()
  const seen = new Set()
  function inspect(current) {
    if (seen.has(current)) return
    seen.add(current)
    visit(current, (child) => {
      if (ts.isPropertyAccessExpression(child) && child.name.text === 'ownerId')
        access.add(`ownerId (${location(child)})`)
      if (ts.isIdentifier(child) && /^GM_(MAX|MIN|HISTORY)/.test(child.text))
        bounds.add(`${child.text} (${location(child)})`)
      if (ts.isPropertyAssignment(child) && child.name.getText() === 'ownerId')
        access.add(`ownerId assigné (${location(child)})`)
      if (!ts.isCallExpression(child)) return
      if (
        ts.isPropertyAccessExpression(child.expression) &&
        child.expression.name.text === 'eq' &&
        child.arguments[0]?.getText() === "'ownerId'"
      )
        access.add(`filtre ownerId (${location(child)})`)
      const label = child.expression.getText()
      if (
        /require.*User|requireSiteAdmin|getSessionAccess|getUserIdentity|safeGetAuthUser/.test(
          label
        )
      )
        auth.add(`${label} (${location(child)})`)
      if (
        /owned[A-Z]|requireOrganizationPermission|requireOrganizationsEnabled|listOwnedResources|listOrganizationResources/.test(
          label
        )
      )
        access.add(`${label} (${location(child)})`)
      if (
        ts.isPropertyAccessExpression(child.expression) &&
        ['take', 'paginate', 'collect'].includes(child.expression.name.text)
      )
        bounds.add(
          `${child.expression.name.text}(${child.arguments.map((arg) => arg.getText().replaceAll(/\s+/g, ' ')).join(', ')}) (${location(child)})`
        )
      const symbol = symbolAt(child.expression)
      for (const declaration of symbol?.declarations ?? []) {
        if (
          !declaration
            .getSourceFile()
            .fileName.startsWith(join(root, 'convex/lib/'))
        )
          continue
        if (
          ts.isFunctionDeclaration(declaration) ||
          ts.isVariableDeclaration(declaration)
        )
          inspect(declaration)
      }
    })
  }
  inspect(node)
  return [auth, access, bounds].map(
    (set) => [...set].join('; ') || '— (revue manuelle)'
  )
}
function validator(node, name) {
  let found = false
  visit(node, (child) => {
    if (ts.isPropertyAssignment(child) && child.name.getText() === name)
      found = true
  })
  return found ? 'oui' : 'non / enveloppe à vérifier'
}
const rows = []
for (const file of appFiles.sort()) {
  const source = program.getSourceFile(file)
  const moduleSymbol = source && checker.getSymbolAtLocation(source)
  if (!moduleSymbol) continue
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol =
      exported.flags & ts.SymbolFlags.Alias
        ? checker.getAliasedSymbol(exported)
        : exported
    const declaration = symbol.valueDeclaration
    if (!declaration) continue
    const type = checker.getTypeOfSymbolAtLocation(symbol, declaration)
    // Registered return types also identify aliased/custom builders in lib,
    // without trusting their names. Markers verified in Convex 1.46.0 sources.
    const http = type.getProperty('isHttp')
    if (!http && !type.getProperty('isPublic')) continue
    const kind = http
      ? 'httpAction'
      : ['Query', 'Mutation', 'Action']
          .find((name) => type.getProperty(`is${name}`))
          ?.toLowerCase()
    if (!kind) throw new Error(`Type Convex inconnu : ${location(declaration)}`)
    const [auth, access, bounds] = evidence(declaration)
    rows.push([
      relative(root, file),
      exported.name,
      kind,
      location(declaration),
      auth,
      access,
      http ? 'HTTP' : validator(declaration, 'args'),
      http ? 'HTTP' : validator(declaration, 'returns'),
      bounds,
    ])
  }
}
if (rows.length === 0)
  throw new Error('Inventaire vide : vérifier la résolution TypeScript.')
function cell(value) {
  return value.replaceAll('|', '&#124;').replaceAll(/\r?\n/g, ' ')
}
console.log(
  '| Fichier | Export | Type | Preuve | Auth (directe ou helper) | Accès (indices AST) | args | returns | Pagination / bornes (indices AST) |'
)
console.log('| --- | --- | --- | --- | --- | --- | --- | --- | --- |')
for (const row of rows) console.log(`| ${row.map(cell).join(' | ')} |`)
let audit = ''
try {
  audit = readFileSync(join(root, 'docs/AUDIT.md'), 'utf-8')
} catch {
  // Missing report is a failed completeness check, even on the first run.
}
const axis =
  audit
    .split('<!-- convex-inventory:start -->')[1]
    ?.split('<!-- convex-inventory:end -->')[0] ?? ''
const documented = new Set(
  axis
    .split('\n')
    .filter((line) => line.startsWith('| '))
    .map((line) =>
      line
        .split('|')
        .slice(1, 4)
        .map((part) => part.trim())
        .join(':')
    )
)
const missing = rows.filter((row) => !documented.has(row.slice(0, 3).join(':')))
console.error(
  `${rows.length} fonctions publiques ; ${missing.length} hors inventaire axe A ; composants exclus : ${components.map((directory) => relative(root, directory)).join(', ')}.`
)
for (const row of missing)
  console.error(`Manquant : ${row[0]}:${row[1]} (${row[2]})`)
if (missing.length > 0) process.exitCode = 1
