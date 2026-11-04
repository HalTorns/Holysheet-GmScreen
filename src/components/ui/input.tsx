import { Input as InputPrimitive } from '@base-ui/react/input'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        'h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 py-2 text-base outline-none placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-ring disabled:cursor-not-allowed disabled:border-dashed disabled:border-border disabled:text-disabled-foreground aria-invalid:border-destructive aria-invalid:outline-destructive md:text-sm',
        className
      )}
      {...props}
    />
  )
}

export { Input }
