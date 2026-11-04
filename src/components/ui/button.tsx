import { Button as ButtonPrimitive } from '@base-ui/react/button'
import { useHydrated } from '@tanstack/react-router'
import { cva } from 'class-variance-authority'
import type { VariantProps } from 'class-variance-authority'

import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-colors outline-none select-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:border-transparent disabled:bg-disabled disabled:text-disabled-foreground aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*=size-])]:size-4',
  {
    variants: {
      variant: {
        default:
          'bg-primary font-semibold text-primary-foreground hover:bg-primary-hover active:bg-primary-active',
        outline:
          'border-border bg-muted text-foreground hover:border-border-strong active:bg-card',
        secondary:
          'border-border bg-secondary text-secondary-foreground hover:border-border-strong active:bg-card',
        ghost: 'hover:bg-muted hover:text-foreground active:bg-border',
        destructive:
          'border-destructive-border text-destructive hover:bg-destructive hover:text-primary-foreground',
        link: 'text-link underline-offset-4 hover:underline',
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
