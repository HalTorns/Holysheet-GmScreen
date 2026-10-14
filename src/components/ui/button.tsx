import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { useHydrated } from '@tanstack/react-router'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/90',
        outline: 'border-border bg-background hover:bg-muted',
        secondary:
          'bg-secondary text-secondary-foreground hover:bg-secondary/80',
        ghost: 'hover:bg-muted hover:text-foreground',
        destructive:
          'bg-destructive/10 text-destructive hover:bg-destructive/20',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-10 gap-2 px-4',
        sm: 'h-8 gap-1.5 px-3 text-xs',
        lg: 'h-12 gap-2 px-6',
        icon: 'size-10',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  disabled = false,
  nativeButton = true,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  const isHydrated = useHydrated()
  return (
    <ButtonPrimitive
      {...props}
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      nativeButton={nativeButton}
      disabled={disabled || (!isHydrated && nativeButton)}
    />
  )
}

export { Button }
