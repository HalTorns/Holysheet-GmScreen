import { CatchBoundary } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'

import { env } from '@/env'

export function OptionalAnalytics({ children }: { children: ReactNode }) {
  const [trackingComponent, setTrackingComponent] =
    useState<ComponentType | null>(null)
  useEffect(() => {
    if (!env.VITE_POSTHOG_KEY) return undefined
    let active = true
    void import('./posthog-provider')
      .then((module) => {
        if (active) setTrackingComponent(() => module.default)
      })
      .catch(() => {
        console.warn('Analytics unavailable; application remains usable.')
      })
    return () => {
      active = false
    }
  }, [])
  const Tracker = trackingComponent
  // The provider belongs to its tracker only. Its loading/failure never wraps,
  // suspends or replaces application children and their in-progress forms.
  return (
    <>
      {children}
      {Tracker && (
        <CatchBoundary
          getResetKey={() => 'analytics'}
          errorComponent={() => null}
          onCatch={() =>
            console.warn('Analytics unavailable; application remains usable.')
          }
        >
          <Tracker />
        </CatchBoundary>
      )}
    </>
  )
}
