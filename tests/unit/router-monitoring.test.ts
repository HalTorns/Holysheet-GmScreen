import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
} from '@tanstack/react-router'
import { expect, test, vi } from 'vitest'

import { installRouterMonitoring } from '../../src/features/observability/router-monitoring'

const { report } = vi.hoisted(() => ({ report: vi.fn() }))
vi.mock('../../src/features/observability/capture-error', () => ({
  reportApplicationError: report,
}))

// Router consumes loader errors. Fetch wrappers cannot own this contract;
// exercise a real router load and preserve the route's own error callback.
test('a consumed loader exception is reported once and remains a route error', async () => {
  const previous = vi.fn()
  const error = new Error('loader failed')
  const root = createRootRoute()
  const route = createRoute({
    getParentRoute: () => root,
    path: '/',
    loader: () => {
      throw error
    },
    onError: previous,
  })
  const tree = root.addChildren([route])
  const router = createRouter({
    routeTree: tree,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    isServer: true,
  })
  installRouterMonitoring(router)
  installRouterMonitoring(router)
  await router.load()
  expect(router.state.matches.some((match) => match.status === 'error')).toBe(
    true
  )
  expect(report).toHaveBeenCalledExactlyOnceWith(error)
  expect(previous).toHaveBeenCalledExactlyOnceWith(error)
})
