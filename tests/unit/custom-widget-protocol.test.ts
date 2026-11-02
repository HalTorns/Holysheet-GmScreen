import { afterEach, expect, test, vi } from 'vitest'

import {
  customInit,
  customOutput,
  customSettings,
  customState,
  messageBudget,
} from '../../shared/custom-widget-protocol'
import { createCustomStateWriter } from '../../src/features/gm/custom-state-writer'

afterEach(() => vi.useRealTimers())
test('custom protocol bounds UTF-8, depth, settings and exact messages independently of payload meaning', () => {
  expect(customState.safeParse({ ok: [1, null, 'é'] }).success).toBe(true)
  expect(customState.safeParse('é'.repeat(4096)).success).toBe(false)
  expect(customSettings.safeParse({ nested: { nope: true } }).success).toBe(
    false
  )
  expect(customSettings.safeParse({ okay: [null, true, 'a', 1] }).success).toBe(
    true
  )
  expect(
    customOutput.safeParse({ type: 'setState', state: 'x'.repeat(8193) })
      .success
  ).toBe(false)
  expect(customOutput.safeParse({ type: 'ready', extra: 'bad' }).success).toBe(
    false
  )
  expect(customInit.safeParse({ type: 'init' }).success).toBe(false)
  for (const [type, limit] of [
    ['setState', 10],
    ['resize', 5],
    ['error', 5],
  ] as const) {
    const allowed = messageBudget()
    for (let index = 0; index < limit; index++)
      expect(allowed(type, 1000)).toBe(true)
    expect(allowed(type, 1000)).toBe(false)
    expect(allowed(type, 2000)).toBe(true)
  }
  const total = messageBudget()
  for (let index = 0; index < 30; index++)
    expect(total('invalid', 1000)).toBe(true)
  expect(total('invalid', 1000)).toBe(false)
})
test('custom persistence coalesces latest state and serializes versions while writes are in flight', async () => {
  vi.useFakeTimers()
  let finish: ((version: number) => void) | undefined
  const save = vi
    .fn<(state: unknown, version: number) => Promise<number>>()
    .mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    .mockResolvedValue(9)
  const report = vi.fn()
  const writer = createCustomStateWriter(7, save, report)
  writer.push({ count: 1 })
  writer.observe(7)
  writer.push({ count: 2 })
  await vi.advanceTimersByTimeAsync(1000)
  expect(save).toHaveBeenCalledExactlyOnceWith({ count: 2 }, 7)
  writer.push({ count: 3 })
  writer.observe(7)
  writer.push({ count: 4 })
  await vi.advanceTimersByTimeAsync(3000)
  expect(save).toHaveBeenCalledTimes(1)
  finish?.(8)
  await vi.advanceTimersByTimeAsync(1000)
  expect(save).toHaveBeenLastCalledWith({ count: 4 }, 8)
  expect(report).not.toHaveBeenCalled()
  writer.push({ count: 5 })
  writer.close()
  await vi.advanceTimersByTimeAsync(2000)
  expect(save).toHaveBeenCalledTimes(2)
})

test('custom writer cancels queued writes in read-only mode and never rebases pending state over a remote edit', async () => {
  vi.useFakeTimers()
  const save = vi
    .fn<(state: unknown, version: number) => Promise<number>>()
    .mockResolvedValue(2)
  const writer = createCustomStateWriter(1, save, () => undefined)
  writer.push({ count: 1 })
  writer.enable(false)
  writer.push({ count: 2 })
  await vi.advanceTimersByTimeAsync(2000)
  expect(save).not.toHaveBeenCalled()
  writer.enable(true)
  writer.push({ count: 3 })
  writer.observe(99)
  await vi.advanceTimersByTimeAsync(1000)
  expect(save).toHaveBeenCalledExactlyOnceWith({ count: 3 }, 1)
  writer.close()
})
