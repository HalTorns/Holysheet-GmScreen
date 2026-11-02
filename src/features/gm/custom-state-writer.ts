import type { customState } from '@shared/custom-widget-protocol'
import type { z } from '@shared/zod'

type State = z.infer<typeof customState>
// One timer and one in-flight request per instance. The newest accepted value wins.
export function createCustomStateWriter(
  version: number,
  save: (state: State, expectedVersion: number) => Promise<number>,
  report: (error: unknown) => void,
  committed?: (state: State, version: number) => void
) {
  let expectedVersion = version
  let pending: State | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let running = false
  let closed = false
  let enabled = true
  const schedule = () => {
    if (closed || !enabled || running || timer || pending === undefined) return
    timer = setTimeout(() => {
      timer = undefined
      void flush()
    }, 1000)
  }
  async function flush() {
    if (closed || !enabled || running || pending === undefined) return
    const state = pending
    pending = undefined
    running = true
    try {
      expectedVersion = await save(state, expectedVersion)
      committed?.(state, expectedVersion)
    } catch (error) {
      closed = true
      report(error)
    } finally {
      running = false
      schedule()
    }
  }
  return {
    enable(value: boolean) {
      enabled = value
      if (!value) {
        clearTimeout(timer)
        timer = undefined
        pending = undefined
      }
    },
    push(state: State) {
      if (!closed && enabled) {
        pending = state
        schedule()
      }
    },
    observe(current: number) {
      if (!running && pending === undefined)
        expectedVersion = Math.max(expectedVersion, current)
    },
    close() {
      closed = true
      clearTimeout(timer)
      pending = undefined
    },
  }
}
