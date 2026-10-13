import { afterEach, describe, expect, it, vi } from 'vitest'
import { internal } from '../../convex/_generated/api'
import { createBackendTest } from './fixtures'

afterEach(() => vi.useRealTimers())

describe('Authentication email abuse controls', () => {
  it('limits delivery per normalized recipient even across different clients and refills after its window', async () => {
    vi.useFakeTimers()
    const backend = createBackendTest()
    for (let index = 0; index < 3; index++) {
      await backend.mutation(internal.emails.consumeQuota, {
        email: 'alice@example.com',
      })
    }
    await expect(
      backend.mutation(internal.emails.consumeQuota, {
        email: 'Alice@example.com',
      }),
    ).rejects.toThrow('RATE_LIMITED')
    await expect(
      backend.mutation(internal.emails.consumeQuota, {
        email: 'bob@example.com',
      }),
    ).resolves.toBeNull()
    vi.advanceTimersByTime(5 * 60_000)
    await expect(
      backend.mutation(internal.emails.consumeQuota, {
        email: 'alice@example.com',
      }),
    ).resolves.toBeNull()
  })
})
