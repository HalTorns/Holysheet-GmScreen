import { useHydrated } from '@tanstack/react-router'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

export function Select({
  className,
  disabled,
  ...props
}: ComponentProps<'select'>) {
  const hydrated = useHydrated()
  return (
    <select
      {...props}
      disabled={disabled || !hydrated}
      className={cn(
        'h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      )}
    />
  )
}
