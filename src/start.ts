import {
  createCsrfMiddleware,
  createMiddleware,
  createStart,
} from '@tanstack/react-start'

const monitorFunctions = createMiddleware({ type: 'function' }).server(
  async ({ next }) => {
    try {
      return await next()
    } catch (error) {
      const { serverMonitoring } =
        await import('@/features/observability/sentry.server')
      const monitoring = await serverMonitoring()
      monitoring?.captureException(error)
      throw error
    }
  }
)

export const startInstance = createStart(() => ({
  functionMiddleware: [monitorFunctions],
  requestMiddleware: [
    createCsrfMiddleware({
      filter: ({ handlerType }) => handlerType === 'serverFn',
    }),
  ],
}))
