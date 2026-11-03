import { X } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Panneau latéral non modal : le Screen reste utilisable derrière. Sous 768 px,
// il devient une feuille basse. Échap le ferme si le focus est dedans.
export function SidePanel({
  open,
  title,
  side = 'right',
  onClose,
  footer,
  children,
}: {
  open: boolean
  title: string
  side?: 'left' | 'right'
  onClose: () => void
  footer?: ReactNode
  children: ReactNode
}) {
  const ref = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  })
  useEffect(() => {
    if (!open) return undefined
    const panel = ref.current
    panel?.focus()
    function onKey(event: KeyboardEvent) {
      if (
        event.key === 'Escape' &&
        !event.defaultPrevented &&
        event.target instanceof Node &&
        panel?.contains(event.target)
      ) {
        event.preventDefault()
        close.current()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  if (!open) return null
  return (
    <aside
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="false"
      aria-label={title}
      data-side-panel={side}
      className={cn(
        'fixed inset-x-0 bottom-0 z-40 flex max-h-[70dvh] flex-col rounded-t-xl border border-border bg-background shadow-xl outline-none md:inset-y-0 md:max-h-none md:w-96 md:rounded-none',
        side === 'right' ? 'md:right-0 md:left-auto' : 'md:right-auto md:left-0'
      )}
    >
      <header className="flex items-center justify-between gap-2 border-b border-border p-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Fermer ${title.toLowerCase()}`}
          title="Fermer"
          onClick={onClose}
        >
          <X />
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto p-3">{children}</div>
      {footer && (
        <footer className="border-t border-border p-3">{footer}</footer>
      )}
    </aside>
  )
}
