import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'

const control = vi.hoisted(() => ({ fail: false }))
vi.mock('../../src/env', () => ({
  env: {
    VITE_POSTHOG_KEY: 'public-test-project',
    VITE_POSTHOG_HOST: 'https://example.test',
  },
}))

// Exercise delayed loading and an SDK render failure at the actual module
// boundary. The application's live draft must survive both transitions.
test('a draft survives analytics loading and a failed tracker', async () => {
  let release!: () => void
  const promise = new Promise<void>((resolve) => {
    release = resolve
  })
  vi.doMock('../../src/features/observability/posthog-provider', async () => {
    await promise
    return {
      default: () => {
        if (control.fail) throw new Error('Tracker unavailable')
        return 'Analytics ready'
      },
    }
  })
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const error = vi.spyOn(console, 'error').mockImplementation(() => {})
  try {
    const { OptionalAnalytics } =
      await import('../../src/features/observability/analytics')
    const content = (
      <label>
        Draft
        <input />
      </label>
    )
    const screen = await render(
      <OptionalAnalytics>{content}</OptionalAnalytics>
    )
    const input = screen.getByRole('textbox', { name: 'Draft' })
    await input.fill('Keep this draft')
    release()
    await expect
      .element(screen.getByText('Analytics ready'))
      .toBeInTheDocument()
    await expect.element(input).toHaveValue('Keep this draft')
    control.fail = true
    await screen.rerender(<OptionalAnalytics>{content}</OptionalAnalytics>)
    await expect.poll(() => warning.mock.calls.length).toBeGreaterThan(0)
    await expect.element(input).toHaveValue('Keep this draft')
  } finally {
    warning.mockRestore()
    error.mockRestore()
    vi.doUnmock('../../src/features/observability/posthog-provider')
  }
})
