import { execFileSync } from 'node:child_process'

// Explicit Convex target options (e.g. --prod) are forwarded unchanged.
// Never print raw CLI output: the only expected result is the inventory page.
const totals = {}
for (const table of [
  'gmNotes',
  'gmWidgetContents',
  'gmLayouts',
  'gmEditorHistory',
]) {
  let cursor = null
  let offset = 0
  const counters = {}
  const samples = new Set()
  let isDone = false
  while (!isDone) {
    const page = JSON.parse(
      execFileSync(
        'pnpm',
        [
          'exec',
          'convex',
          'run',
          'gmWidgetMigrations:inventory',
          JSON.stringify({ table, cursor, offset }),
          ...process.argv.slice(2),
        ],
        { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] }
      )
    )
    for (const [key, value] of Object.entries(page.counters))
      counters[key] = (counters[key] ?? 0) + value
    for (const id of page.samples) if (samples.size < 3) samples.add(id)
    cursor = page.continueCursor
    offset = page.offset
    isDone = page.isDone
  }
  totals[table] = { counters, samples: [...samples] }
}
console.log(JSON.stringify(totals, null, 2))
if (
  Object.values(totals).some(({ counters }) =>
    Object.entries(counters).some(
      ([key, value]) =>
        key !== 'scanned' && key !== 'oldLayoutPurgedReferences' && value > 0
    )
  )
)
  process.exitCode = 1
