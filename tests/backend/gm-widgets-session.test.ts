import { afterEach, describe, expect, it, vi } from 'vitest'

import { api, internal } from '../../convex/_generated/api'
import { gmWidget, initialWidget } from '../../shared/gm'
import { readScreen } from '../helpers/gm-screen'
import { createAuthenticatedUser, createBackendTest } from './fixtures'

afterEach(() => vi.useRealTimers())
type Kind = 'table' | 'clock' | 'initiative'
async function setup(kind: Kind) {
  const backend = createBackendTest()
  const alice = await createAuthenticatedUser(
    backend,
    'session-alice@example.test'
  )
  const bob = await createAuthenticatedUser(backend, 'session-bob@example.test')
  const projectId = await alice.client.mutation(api.gm.createProject, {
    title: 'Campagne',
  })
  const screenId = await alice.client.mutation(api.gm.createScreen, {
    projectId,
    title: 'Écran',
    format: 'digital',
  })
  const id = await alice.client.mutation(api.gmWidgets.addWidget, {
    screenId,
    kind,
  })
  const read = async () => {
    const page = await alice.client.query(api.gmWidgets.listScreenWidgets, {
      screenId,
      paginationOpts: { cursor: null, numItems: 10 },
    })
    const widget = page.page.find((entry) => entry._id === id)
    if (!widget) throw new Error('Missing widget')
    return widget
  }
  const history = () =>
    alice.client.query(api.gmEditor.listHistory, {
      target: { kind: 'note', id },
      paginationOpts: { cursor: null, numItems: 20 },
    })
  return { backend, alice, bob, projectId, screenId, id, read, history }
}
// These tests enter public mutations: atomic complete writes, timing authority,
// mode-specific validation and lifecycle were absent from the earlier kind tests.
describe('F5a complete widget writes', () => {
  for (const kind of ['table', 'clock', 'initiative'] as const) {
    it(`${kind}: defaults, locking, conflict, foreign entry points and complete lifecycle`, async () => {
      const { backend, alice, bob, screenId, id, read, history } =
        await setup(kind)
      const original = await read()
      expect(original).toMatchObject(initialWidget(kind))
      const definition = initialWidget(kind)
      // Narrow the union at its public envelope, retaining kind/config/state correlation.
      const edited =
        kind === 'table'
          ? {
              ...initialWidget('table'),
              config: { ...initialWidget('table').config, title: 'Référence' },
            }
          : kind === 'clock'
            ? {
                ...initialWidget('clock'),
                config: { ...initialWidget('clock').config, title: 'Temps' },
              }
            : { ...initialWidget('initiative'), config: { title: 'Combat' } }
      await alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 0,
        widget: edited,
      })
      await expect(
        alice.client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 0,
          widget: edited,
        })
      ).rejects.toThrow('CONFLICT')
      const revision = (await history()).page[0]
      if (!revision) throw new Error('Missing history')
      await alice.client.mutation(api.gmEditor.setLayoutLocked, {
        screenId,
        locked: true,
      })
      await expect(
        alice.client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 1,
          widget: definition,
        })
      ).rejects.toThrow('LAYOUT_LOCKED')
      if (edited.kind === 'table')
        await alice.client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 1,
          widget: {
            ...edited,
            state: { rows: [{ id: 'r', cells: ['séance', ''] }] },
          },
        })
      else if (edited.kind === 'initiative')
        await alice.client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 1,
          widget: {
            ...edited,
            state: {
              entries: [{ id: 'a', name: 'A', score: 1, note: '' }],
              currentId: 'a',
              round: 2,
            },
          },
        })
      else
        await alice.client.mutation(api.gmWidgets.controlClock, {
          id,
          expectedVersion: 1,
          action: 'start',
        })
      await expect(
        alice.client.mutation(api.gmEditor.restoreRevision, {
          id: revision._id,
          expectedVersion: 2,
        })
      ).rejects.toThrow('LAYOUT_LOCKED')
      await alice.client.mutation(api.gmEditor.setLayoutLocked, {
        screenId,
        locked: false,
      })
      await alice.client.mutation(api.gmEditor.restoreRevision, {
        id: revision._id,
        expectedVersion: 2,
      })
      expect(await read()).toMatchObject(definition)
      const screen = await readScreen(alice.client, { id: screenId })
      const layout = screen?.layouts[0]
      if (!layout) throw new Error('Missing layout')
      for (const operation of ['duplicate', 'trash'] as const)
        await expect(
          bob.client.mutation(api.gmWidgets.changeNotes, {
            layoutId: layout._id,
            expectedVersion: layout.version,
            notes: [{ id, version: 3 }],
            operation,
          })
        ).rejects.toThrow('NOT_FOUND')
      await expect(
        bob.client.mutation(api.gmWidgets.addWidget, { screenId, kind })
      ).rejects.toThrow('NOT_FOUND')
      await expect(
        bob.client.query(api.gmWidgets.listScreenWidgets, {
          screenId,
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).rejects.toThrow('NOT_FOUND')
      await expect(
        bob.client.query(api.gmWidgets.getNoteContent, { id })
      ).rejects.toThrow('NOT_FOUND')
      await expect(
        bob.client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 3,
          widget: definition,
        })
      ).rejects.toThrow('NOT_FOUND')
      await expect(
        bob.client.query(api.gmEditor.listHistory, {
          target: { kind: 'note', id },
          paginationOpts: { cursor: null, numItems: 10 },
        })
      ).rejects.toThrow('NOT_FOUND')
      await expect(
        bob.client.mutation(api.gmEditor.restoreRevision, {
          id: revision._id,
          expectedVersion: 3,
        })
      ).rejects.toThrow('NOT_FOUND')
      await expect(
        bob.client.mutation(api.gmWidgets.controlClock, {
          id,
          expectedVersion: 3,
          action: 'reset',
        })
      ).rejects.toThrow('NOT_FOUND')
      const [copy] = await alice.client.mutation(api.gmWidgets.changeNotes, {
        layoutId: layout._id,
        expectedVersion: layout.version,
        notes: [{ id, version: 3 }],
        operation: 'duplicate',
      })
      expect(copy).toBeTruthy()
      const afterCopy = await readScreen(alice.client, { id: screenId })
      expect(
        afterCopy?.notes.find((entry) => entry._id === copy)
      ).toMatchObject(definition)
      const changedLayout = afterCopy?.layouts[0]
      if (!changedLayout) throw new Error('Missing layout')
      await alice.client.mutation(api.gmWidgets.changeNotes, {
        layoutId: changedLayout._id,
        expectedVersion: changedLayout.version,
        notes: [{ id, version: 3 }],
        operation: 'trash',
      })
      for (const client of [bob.client]) {
        await expect(
          client.query(api.gmWidgets.listTrash, {
            screenId,
            paginationOpts: { cursor: null, numItems: 10 },
          })
        ).rejects.toThrow('NOT_FOUND')
        await expect(
          client.mutation(api.gmWidgets.restoreNote, { id, expectedVersion: 4 })
        ).rejects.toThrow('NOT_FOUND')
        await expect(
          client.mutation(api.gmWidgets.purgeNote, {
            id,
            expectedVersion: 4,
            confirmation: 'DELETE_NOTE',
          })
        ).rejects.toThrow('NOT_FOUND')
      }
      const trash = await alice.client.query(api.gmWidgets.listTrash, {
        screenId,
        paginationOpts: { cursor: null, numItems: 10 },
      })
      expect(trash.page[0]).toMatchObject(definition)
      await alice.client.mutation(api.gmWidgets.restoreNote, {
        id,
        expectedVersion: 4,
      })
      expect(await read()).toMatchObject(definition)
      const exported = await alice.client.query(api.gm.exportCollection, {
        collection: 'gmNotes',
        paginationOpts: { cursor: null, numItems: 10 },
      })
      expect(exported.page.find((entry) => entry._id === id)).toMatchObject(
        definition
      )
      await expect(
        bob.client.query(api.gm.getScreen, { id: screenId })
      ).resolves.toBeNull()
      vi.useFakeTimers()
      await backend.mutation(internal.cleanup.deletedAccount, {
        userId: alice.userId,
        email: 'session-alice@example.test',
      })
      await backend.finishAllScheduledFunctions(() => vi.runAllTimers())
      for (const table of ['gmNotes', 'gmEditorHistory', 'gmLayouts'] as const)
        expect(
          await backend.run((ctx) => ctx.db.query(table).collect())
        ).toEqual([])
    })
  }

  it('table: validates submitted width atomically, pastes 2 → 3 columns, and recovers deleted column values', async () => {
    const { alice, screenId, id, read, history } = await setup('table')
    const base = initialWidget('table')
    const pasted = {
      ...base,
      config: {
        title: '',
        columns: [...base.config.columns, { id: 'c3', label: 'Trésor' }],
      },
      state: { rows: [{ id: 'r', cells: ['A', 'B', 'Or'] }] },
    }
    const invalid = [
      { ...pasted, state: base.state },
      { ...base, config: { ...base.config, columns: [] } },
      {
        ...base,
        config: {
          ...base.config,
          columns: Array.from({ length: 13 }, (_, index) => ({
            id: `c${index}`,
            label: '',
          })),
        },
      },
      {
        ...base,
        config: {
          ...base.config,
          columns: [
            { id: 'c', label: '' },
            { id: 'c', label: '' },
          ],
        },
      },
      {
        ...base,
        config: {
          ...base.config,
          columns: [{ id: 'c', label: 'x'.repeat(61) }],
        },
      },
      {
        ...base,
        state: {
          rows: Array.from({ length: 101 }, (_, index) => ({
            id: `r${index}`,
            cells: ['', ''],
          })),
        },
      },
      {
        ...base,
        state: {
          rows: [
            { id: 'r', cells: ['', ''] },
            { id: 'r', cells: ['', ''] },
          ],
        },
      },
      { ...base, state: { rows: [{ id: 'r', cells: ['x'.repeat(501), ''] }] } },
    ]
    for (const widget of invalid) {
      // Invalid shapes are supplied through the real validator without unsafe casts.
      expect(gmWidget.safeParse(widget).success).toBe(false)
      await expect(
        alice.client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 0,
          widget,
        })
      ).rejects.toThrow('INVALID_INPUT')
    }
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 0,
        widget: { ...pasted, state: base.state },
      })
    ).rejects.toThrow('INVALID_INPUT')
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: true,
    })
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 0,
        widget: pasted,
      })
    ).rejects.toThrow('LAYOUT_LOCKED')
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: false,
    })
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 0,
      widget: pasted,
    })
    expect(await read()).toMatchObject(pasted)
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 1,
      widget: base,
    })
    const revision = (await history()).page.find((entry) => entry.version === 1)
    if (!revision) throw new Error('Missing full table snapshot')
    await alice.client.mutation(api.gmEditor.restoreRevision, {
      id: revision._id,
      expectedVersion: 2,
    })
    expect(await read()).toMatchObject(pasted)
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 3,
        widget: {
          ...base,
          state: {
            rows: Array.from({ length: 100 }, (_, index) => ({
              id: `r${index}`,
              cells: ['x'.repeat(500), 'x'.repeat(500)],
            })),
          },
        },
      })
    ).rejects.toThrow('DOCUMENT_LIMIT')
  })

  it('clock: server time, exact cumulative pause/reset, strict actions and updateWidget cannot pilot time', async () => {
    const { alice, bob, id, read, history } = await setup('clock')
    vi.useFakeTimers()
    const epoch = Date.now()
    vi.setSystemTime(epoch)
    const start = await alice.client.mutation(api.gmWidgets.controlClock, {
      id,
      expectedVersion: 0,
      action: 'start',
    })
    expect(start).toEqual({ version: 1, serverNow: epoch })
    for (const state of [
      { running: false, elapsedMs: 0 },
      { running: true, startedAt: epoch + 1, elapsedMs: 0 },
      { running: true, startedAt: epoch, elapsedMs: 1 },
    ]) {
      await expect(
        alice.client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 1,
          widget: {
            kind: 'clock',
            config: { title: '', mode: 'stopwatch' },
            state,
          },
        })
      ).rejects.toThrow('INVALID_INPUT')
    }
    vi.setSystemTime(epoch + 2500)
    expect(
      await alice.client.mutation(api.gmWidgets.controlClock, {
        id,
        expectedVersion: 1,
        action: 'pause',
      })
    ).toEqual({ version: 2, serverNow: epoch + 2500 })
    expect(await read()).toMatchObject({
      state: { running: false, elapsedMs: 2500 },
    })
    const runningRevision = (await history()).page.find(
      (entry) => entry.version === 1
    )
    if (!runningRevision) throw new Error('Missing running snapshot')
    await alice.client.mutation(api.gmWidgets.controlClock, {
      id,
      expectedVersion: 2,
      action: 'start',
    })
    vi.setSystemTime(epoch + 3500)
    await alice.client.mutation(api.gmWidgets.controlClock, {
      id,
      expectedVersion: 3,
      action: 'pause',
    })
    expect(await read()).toMatchObject({
      state: { running: false, elapsedMs: 3500 },
    })
    await expect(
      alice.client.mutation(api.gmWidgets.controlClock, {
        id,
        expectedVersion: 3,
        action: 'reset',
      })
    ).rejects.toThrow('CONFLICT')
    await alice.client.mutation(api.gmWidgets.controlClock, {
      id,
      expectedVersion: 4,
      action: 'reset',
    })
    expect(await read()).toMatchObject({
      state: { running: false, elapsedMs: 0 },
    })
    await expect(
      alice.client.mutation(api.gmWidgets.controlClock, {
        id,
        expectedVersion: 5,
        action: { filled: 1 },
      })
    ).rejects.toThrow('INVALID_INPUT')
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 5,
      widget: {
        kind: 'clock',
        config: { title: '', mode: 'timer', durationMs: 10_000 },
        state: { running: false, elapsedMs: 0 },
      },
    })
    vi.setSystemTime(epoch + 100_000)
    await alice.client.mutation(api.gmEditor.restoreRevision, {
      id: runningRevision._id,
      expectedVersion: 6,
    })
    const restored = await read()
    expect(restored).toMatchObject({
      config: { mode: 'stopwatch' },
      state: { running: false, elapsedMs: 2500 },
    })
    expect(restored.state).not.toHaveProperty('startedAt')
    const timerRevision = (await history()).page.find(
      (entry) => entry.version === 6
    )
    if (!timerRevision) throw new Error('Missing timer snapshot')
    await alice.client.mutation(api.gmEditor.restoreRevision, {
      id: timerRevision._id,
      expectedVersion: 7,
    })
    expect(await read()).toMatchObject({
      config: { mode: 'timer', durationMs: 10_000 },
      state: { running: false, elapsedMs: 0 },
    })
    await expect(
      bob.client.mutation(api.gmWidgets.controlClock, {
        id,
        expectedVersion: 8,
        action: 'start',
      })
    ).rejects.toThrow('NOT_FOUND')
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 8,
      widget: {
        kind: 'clock',
        config: { title: '', mode: 'segments', segments: 4 },
        state: { filled: 0 },
      },
    })
    for (const action of ['start', 'pause', 'reset'] as const)
      await expect(
        alice.client.mutation(api.gmWidgets.controlClock, {
          id,
          expectedVersion: 9,
          action,
        })
      ).rejects.toThrow('INVALID_INPUT')
    for (const filled of [-1, 5, 1.5])
      await expect(
        alice.client.mutation(api.gmWidgets.controlClock, {
          id,
          expectedVersion: 9,
          action: { filled },
        })
      ).rejects.toThrow('INVALID_INPUT')
    expect(
      await alice.client.mutation(api.gmWidgets.controlClock, {
        id,
        expectedVersion: 9,
        action: { filled: 3 },
      })
    ).toEqual({ version: 10, serverNow: epoch + 100_000 })
    expect(await read()).toMatchObject({ state: { filled: 3 } })
    await expect(
      alice.client.mutation(api.gmWidgets.controlClock, {
        id,
        expectedVersion: 9,
        action: { filled: 2 },
      })
    ).rejects.toThrow('CONFLICT')
  })

  it('rejects clock and initiative bounds at the public write entry point', async () => {
    const { alice, screenId } = await setup('clock')
    const clockId = await alice.client.mutation(api.gmWidgets.addWidget, {
      screenId,
      kind: 'clock',
    })
    for (const durationMs of [999, 86_400_001, 1000.5])
      await expect(
        alice.client.mutation(api.gmWidgets.updateWidget, {
          id: clockId,
          expectedVersion: 0,
          widget: {
            kind: 'clock',
            config: { title: '', mode: 'timer', durationMs },
            state: { running: false, elapsedMs: 0 },
          },
        })
      ).rejects.toThrow('INVALID_INPUT')
    for (const segments of [1, 13, 2.5])
      await expect(
        alice.client.mutation(api.gmWidgets.updateWidget, {
          id: clockId,
          expectedVersion: 0,
          widget: {
            kind: 'clock',
            config: { title: '', mode: 'segments', segments },
            state: { filled: 0 },
          },
        })
      ).rejects.toThrow('INVALID_INPUT')
    // Convex's strict union rejects incompatible mode fields before the handler.
    const incoherentConfig = {
      title: '',
      mode: 'stopwatch' as const,
      durationMs: 1000,
    }
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id: clockId,
        expectedVersion: 0,
        widget: {
          kind: 'clock',
          config: incoherentConfig,
          state: { running: false, elapsedMs: 0 },
        },
      })
    ).rejects.toThrow()
    const initiativeId = await alice.client.mutation(api.gmWidgets.addWidget, {
      screenId,
      kind: 'initiative',
    })
    const entry = { id: 'a', name: 'A', score: 0, note: '' }
    for (const state of [
      {
        entries: Array.from({ length: 31 }, (_, index) => ({
          ...entry,
          id: `a${index}`,
        })),
        round: 1,
      },
      { entries: [entry, entry], round: 1 },
      { entries: [entry], currentId: 'missing', round: 1 },
      { entries: [entry], round: 0 },
      ...[Number.NaN, Number.POSITIVE_INFINITY, -1000, 1000].map((score) => ({
        entries: [{ ...entry, score }],
        round: 1,
      })),
      { entries: [{ ...entry, name: '' }], round: 1 },
      { entries: [{ ...entry, note: 'x'.repeat(121) }], round: 1 },
    ])
      await expect(
        alice.client.mutation(api.gmWidgets.updateWidget, {
          id: initiativeId,
          expectedVersion: 0,
          widget: { kind: 'initiative', config: { title: '' }, state },
        })
      ).rejects.toThrow('INVALID_INPUT')
  })
  it('clock: title edits preserve time; mode edits submit an explicit initial state; locked segments remain usable', async () => {
    const { alice, id, screenId, read } = await setup('clock')
    const base = initialWidget('clock')
    await alice.client.mutation(api.gmWidgets.controlClock, {
      id,
      expectedVersion: 0,
      action: 'start',
    })
    const running = await read()
    if (running.kind !== 'clock') throw new Error('Missing clock')
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 1,
      widget: {
        kind: 'clock',
        config: { title: 'Titre modifié', mode: 'stopwatch' },
        state: running.state,
      },
    })
    expect((await read()).state).toEqual(running.state)
    const timer = {
      kind: 'clock' as const,
      config: { title: '', mode: 'timer' as const, durationMs: 1000 },
      state: { running: false, elapsedMs: 0 },
    }
    for (const state of [
      running.state,
      { running: false, elapsedMs: 1 },
      { running: false, elapsedMs: 0, startedAt: 1 },
      { filled: 0 },
    ])
      await expect(
        alice.client.mutation(api.gmWidgets.updateWidget, {
          id,
          expectedVersion: 2,
          widget: { ...timer, state },
        })
      ).rejects.toMatchObject({ data: { code: 'INVALID_INPUT' } })
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 2,
      widget: timer,
    })
    expect(await read()).toMatchObject(timer)
    await alice.client.mutation(api.gmWidgets.updateWidget, {
      id,
      expectedVersion: 3,
      widget: {
        kind: 'clock',
        config: { title: '', mode: 'segments', segments: 4 },
        state: { filled: 0 },
      },
    })
    await alice.client.mutation(api.gmEditor.setLayoutLocked, {
      screenId,
      locked: true,
    })
    await alice.client.mutation(api.gmWidgets.controlClock, {
      id,
      expectedVersion: 4,
      action: { filled: 2 },
    })
    expect((await read()).state).toEqual({ filled: 2 })
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 5,
        widget: {
          kind: 'clock',
          config: { title: '', mode: 'segments', segments: 4 },
          state: { filled: 3 },
        },
      })
    ).rejects.toThrow('INVALID_INPUT')
    await expect(
      alice.client.mutation(api.gmWidgets.updateWidget, {
        id,
        expectedVersion: 5,
        widget: base,
      })
    ).rejects.toThrow('LAYOUT_LOCKED')
  })
})
