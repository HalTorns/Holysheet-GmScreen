import { z } from '@shared/zod'
import type { PostHogConfig } from 'posthog-js'

const pageEvent = z.object({
  distinct_id: z.string(),
  page: z.enum(['home', 'sign-in', 'application', 'mfa', 'other']),
})
export function analyticsOptions(
  apiKey: string,
  host: string
): Partial<PostHogConfig> {
  return {
    api_host: host,
    persistence: 'memory',
    autocapture: false,
    capture_pageview: false,
    capture_pageleave: false,
    disable_session_recording: true,
    person_profiles: 'never',
    advanced_disable_flags: true,
    disable_external_dependency_loading: true,
    capture_performance: false,
    capture_exceptions: false,
    before_send: (event) => {
      if (!event || event.event !== 'page_viewed') return null
      const data = pageEvent.safeParse(event.properties)
      if (!data.success) return null
      // The public project key is mandatory for ingestion. Rebuild both levels
      // to exclude URL/referrer/DOM/user properties, including $set/$set_once.
      return {
        uuid: event.uuid,
        event: 'page_viewed',
        properties: { ...data.data, token: apiKey },
        ...(event.timestamp ? { timestamp: event.timestamp } : {}),
      }
    },
  }
}
