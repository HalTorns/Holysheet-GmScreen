import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { z } from 'zod'

const root = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const execute = promisify(execFile)
const reportSchema = z.object({
  result: z.literal('passed'),
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
  const reportPath = output.match(
    /Report: (backups\/[A-Za-z0-9.-]+\/report\.json)\./,
  )?.[1]
  if (!reportPath) throw new Error('Le rapport de restauration est absent.')
  return reportSchema.parse(
    JSON.parse(await readFile(join(root, reportPath), 'utf8')),
  )
}
