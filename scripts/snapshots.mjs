import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { promisify } from 'node:util'

const execute = promisify(execFile)
async function command(program, args, options = {}) {
  try {
    const result = await execute(program, args, {
      maxBuffer: 128 * 1024 * 1024,
      timeout: 180_000,
      ...options,
    })
    return result.stdout
  } catch {
    throw new Error('Snapshot inventory failed; private output omitted.')
  }
}

function canonicalJson(value) {
  if (Array.isArray(value)) return value.map(canonicalJson)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalJson(value[key])])
    )
  }
  return value
}

export function checksum(value) {
  return createHash('sha256').update(value).digest('hex')
}

export async function archiveInventory(path) {
  const names = (await command('unzip', ['-Z1', path]))
    .split('\n')
    .filter((name) => name && !name.endsWith('/'))
  const tables = {}
  const files = {}
  for (const name of names) {
    if (name.endsWith('/documents.jsonl')) {
      // Table-number metadata belongs to each backend. Application IDs and
      // creation times remain in the comparison and must survive the import.
      if (
        name.endsWith('/_tables/documents.jsonl') ||
        name === '_tables/documents.jsonl'
      )
        continue
      const payload = await command('unzip', ['-p', path, name])
      let documents
      try {
        documents = payload
          .split('\n')
          .filter((line) => line.trim())
          .map((line) => JSON.stringify(canonicalJson(JSON.parse(line))))
          .sort()
      } catch {
        throw new Error('A snapshot contains invalid JSON documents.')
      }
      tables[name.slice(0, -'/documents.jsonl'.length)] = {
        count: documents.length,
        checksum: checksum(documents.join('\n')),
      }
    } else if (name.includes('_storage/')) {
      const payload = await command('unzip', ['-p', path, name], {
        encoding: 'buffer',
      })
      files[name] = { bytes: payload.length, checksum: checksum(payload) }
    }
  }
  return { tables, files }
}

export function compareInventories(source, restored) {
  for (const name of new Set([
    ...Object.keys(source.tables),
    ...Object.keys(restored.tables),
  ])) {
    const before = source.tables[name] ?? { count: 0, checksum: checksum('') }
    const after = restored.tables[name] ?? { count: 0, checksum: checksum('') }
    if (before.count !== after.count || before.checksum !== after.checksum) {
      throw new Error(`Restored table payload differs: ${name}.`)
    }
  }
  if (
    JSON.stringify(canonicalJson(source.files)) !==
    JSON.stringify(canonicalJson(restored.files))
  ) {
    throw new Error('Restored file-storage payload differs.')
  }
}
