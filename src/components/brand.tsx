import { appConfig } from '@shared/app-config'
import { Link } from '@tanstack/react-router'

import { cn } from '@/lib/utils'

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn('brand', className)}
      aria-label={`${appConfig.name} — accueil`}
    >
      <span className="brand-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </span>
      <span>
        {appConfig.brandName}
        <span className="text-primary">.</span>
      </span>
    </Link>
  )
}
