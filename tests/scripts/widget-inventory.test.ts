// @vitest-environment node
import { spawnSync } from 'node:child_process'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, it } from 'vitest'

import { z } from '../../shared/zod'

// Exercise the real operator entrypoint. Only convex run's transport is faked:
// the regression is losing the offset or treating historical references as blockers.
it.each(['clean', 'blocking', 'failure'])(
  'aggregates all table pages with bounded samples (%s)',
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), 'widget-inventory-'))
    const log = join(directory, 'calls.jsonl')
    try {
      await writeFile(
        join(directory, 'pnpm'),
        `#!${process.execPath}
const { appendFileSync } = require('node:fs')
const args = process.argv.slice(2)
appendFileSync(process.env.TEST_INVENTORY_LOG, JSON.stringify(args) + '\\n')
if (process.env.TEST_INVENTORY_MODE === 'failure') process.exit(2)
const { cursor, offset } = JSON.parse(args[4])
const done = cursor === 'second'
console.log(JSON.stringify({
  counters: {
    scanned: offset === 0 ? 1 : 0,
    orphanPayloads: process.env.TEST_INVENTORY_MODE === 'blocking' && done ? 1 : 0,
    oldLayoutPurgedReferences: 2,
  },
  samples: ['id' + offset, 'id2', 'id3'],
  continueCursor: offset === 0 && !done ? null : 'second',
  offset: offset === 0 && !done ? 5 : 0,
  isDone: done,
}))
`,
        { mode: 0o700 }
      )
      const result = spawnSync(
        process.execPath,
        [
          new URL('../../scripts/widget-inventory.mjs', import.meta.url)
            .pathname,
          '--prod',
        ],
        {
          env: {
            ...process.env,
            PATH: `${directory}:${process.env.PATH ?? ''}`,
            TEST_INVENTORY_LOG: log,
            TEST_INVENTORY_MODE: mode,
          },
          encoding: 'utf-8',
          timeout: 10_000,
        }
      )
      expect(result.status).toBe(mode === 'clean' ? 0 : 1)
      const calls = (await readFile(log, 'utf-8'))
        .trim()
        .split('\n')
        .map((line) => z.array(z.string()).parse(JSON.parse(line)))
      expect(calls.every((args) => args[5] === '--prod')).toBe(true)
      if (mode === 'failure') {
        expect(result.stdout).toBe('')
        expect(calls).toHaveLength(1)
        return
      }
      expect(calls).toHaveLength(12)
      expect(JSON.parse(calls[1]?.[4] ?? '{}')).toMatchObject({
        cursor: null,
        offset: 5,
      })
      expect(JSON.parse(calls[2]?.[4] ?? '{}')).toMatchObject({
        cursor: 'second',
        offset: 0,
      })
      const totals = z
        .record(
          z.string(),
          z.object({
            counters: z.record(z.string(), z.number()),
            samples: z.array(z.string()),
          })
        )
        .parse(JSON.parse(result.stdout))
      expect(Object.keys(totals)).toEqual([
        'gmNotes',
        'gmWidgetContents',
        'gmLayouts',
        'gmEditorHistory',
      ])
      for (const table of Object.values(totals)) {
        expect(table.counters.scanned).toBe(2)
        expect(table.counters.oldLayoutPurgedReferences).toBe(6)
        expect(table.samples).toHaveLength(3)
      }
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)
