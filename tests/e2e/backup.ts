import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { promisify } from 'node:util'

import { z } from 'zod'

const root = dirname(dirname(import.meta.dirname))
const execute = promisify(execFile)
const reportSchema = z.object({
  result: z.literal('passed'),
  widgetRelations: z.object({
    valid: z.boolean(),
    linkedCounters: z.number().int().nonnegative(),
    availableCounters: z.number().int().nonnegative(),
    checkedItems: z.number().int().nonnegative(),
    kinds: z.array(z.string()),
    payloads: z.number().int().nonnegative(),
    nonEmptyNotes: z.number().int().nonnegative(),
    trashed: z.number().int().nonnegative(),
    revisions: z.number().int().nonnegative(),
  }),
  tables: z.record(z.string(), z.number().int().nonnegative()),
  disposableResourcesRemoved: z.literal(true),
  mainEnvironmentFilesPreserved: z.literal(true),
})

export async function verifyLocalRestore() {
  let output: string
  try {
    const result = await execute('pnpm', ['backup:verify'], {
      cwd: root,
      maxBuffer: 1024 * 1024,
      timeout: 120_000,
    })
    output = result.stdout
  } catch {
    throw new Error('La restauration isolée a échoué ; sortie privée masquée.')
  }
  const reportPath = /Report: (backups\/[A-Za-z0-9.-]+\/report\.json)\./.exec(
    output
  )?.[1]
  if (!reportPath) throw new Error('Le rapport de restauration est absent.')
  return reportSchema.parse(
    JSON.parse(await readFile(join(root, reportPath), 'utf-8'))
  )
}
