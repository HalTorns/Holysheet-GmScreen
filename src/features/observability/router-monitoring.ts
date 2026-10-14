import { reportApplicationError } from './capture-error'

const configured = new WeakSet<object>()
type MonitoredRoute = {
  options: { onError?: (error: unknown) => void }
  update: (options: { onError: (error: unknown) => void }) => unknown
}

export function installRouterMonitoring(router: {
  routesById: Record<string, MonitoredRoute>
}) {
  // Route definitions are shared but capture no request data. Install once to
  // avoid stacking callbacks each time SSR creates its request-scoped router.
  for (const route of Object.values(router.routesById)) {
    if (configured.has(route)) continue
    const previous = route.options.onError
    route.update({
      onError: (error: unknown) => {
        reportApplicationError(error)
        previous?.(error)
      },
    })
    configured.add(route)
  }
}
