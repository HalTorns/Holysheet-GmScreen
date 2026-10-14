import { PostHogProvider, usePostHog } from '@posthog/react'
import { analyticsPage } from '@shared/telemetry'
import { useRouterState } from '@tanstack/react-router'
import { PostHog } from 'posthog-js'
import { useEffect } from 'react'

import { env } from '@/env'

import { analyticsOptions } from './analytics-options'

// This module is imported by a client effect only. Initialize before children
// mount so their first page event never races the provider's initialization.
const client =
  typeof window === 'undefined' || !env.VITE_POSTHOG_KEY
    ? null
    : new PostHog().init(
        env.VITE_POSTHOG_KEY,
        analyticsOptions(env.VITE_POSTHOG_KEY, env.VITE_POSTHOG_HOST)
      )

export default function AnalyticsTracker() {
  if (!client) return null
  return (
    <PostHogProvider client={client}>
      <PageEvents />
    </PostHogProvider>
  )
}
function PageEvents() {
  const posthog = usePostHog()
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  })
  useEffect(() => {
    posthog.capture('page_viewed', { page: analyticsPage(pathname) })
  }, [posthog, pathname])
  return null
}
