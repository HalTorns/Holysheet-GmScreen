import { appConfig } from '@shared/app-config'
import { Link } from '@tanstack/react-router'

import { cn } from '@/lib/utils'

/** Signe Holysheet : écran de MJ à trois volets, le central plein. */
function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      className={cn('brand-mark', className)}
      viewBox="0 0 64 56"
      aria-hidden="true"
    >
      <path
        d="M5 11 L20 7 L20 49 L5 45 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
      <path d="M25 7 L39 7 L39 49 L25 49 Z" fill="currentColor" />
      <path
        d="M44 7 L59 11 L59 45 L44 49 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Brand({ className }: { className?: string }) {
  return (
    <Link
      to="/"
      className={cn('brand', className)}
      aria-label={`${appConfig.name} — accueil`}
    >
      <BrandMark />
      <span>{appConfig.brandName.toLowerCase()}</span>
    </Link>
  )
}
