import { createContext, useContext } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'

import { Button } from '@/components/ui/button'

// La configuration d'un widget reste rendue par le widget lui-même (donc avec
// son brouillon), mais elle est téléportée dans l'onglet Contenu de
// l'inspecteur. Hors éditeur (tests, autres pages), elle reste en ligne.

type Inspector = { targetId: string | null; slot: HTMLElement | null }

const InspectorContext = createContext<Inspector | null>(null)
const ScopeContext = createContext<string | null>(null)

export const InspectorProvider = InspectorContext.Provider

export function WidgetScope({
  id,
  children,
}: {
  id: string
  children: ReactNode
}) {
  return <ScopeContext.Provider value={id}>{children}</ScopeContext.Provider>
}

/**
 * Où s'affiche la configuration du widget courant : en ligne hors éditeur,
 * dans l'inspecteur s'il vise ce widget, sinon nulle part.
 */
export function useConfigPlacement(): 'inline' | 'panel' | 'hidden' {
  const inspector = useContext(InspectorContext)
  const id = useContext(ScopeContext)
  if (!inspector || id === null) return 'inline'
  return inspector.targetId === id && inspector.slot !== null
    ? 'panel'
    : 'hidden'
}

export function WidgetConfig({ children }: { children: ReactNode }) {
  const inspector = useContext(InspectorContext)
  const id = useContext(ScopeContext)
  if (!inspector || id === null) return children
  if (inspector.targetId !== id || !inspector.slot) return null
  return createPortal(children, inspector.slot)
}

type Draft = {
  dirty: boolean
  pending: boolean
  conflict: boolean
  error: string | null
  save: () => Promise<unknown>
}

/**
 * Enregistrer n'apparaît que lorsqu'il sert : sauvegarde automatique coupée
 * avec un brouillon, ou relance après un échec. En conflit, il reste visible
 * mais désactivé : le serveur refuserait une version périmée.
 */
export function SaveControl({
  editor,
  autoSave,
  disabled = false,
  label,
}: {
  editor: Draft
  autoSave: boolean
  disabled?: boolean
  label: string
}) {
  if (editor.conflict)
    return (
      <Button size="sm" disabled title="Ce contenu a changé dans une autre vue">
        {label}
      </Button>
    )
  if (editor.error && editor.dirty)
    return (
      <Button
        size="sm"
        disabled={disabled || editor.pending}
        onClick={() => void editor.save()}
      >
        Réessayer l’enregistrement
      </Button>
    )
  if (autoSave || !editor.dirty) return null
  return (
    <Button
      size="sm"
      disabled={disabled || editor.pending}
      onClick={() => void editor.save()}
    >
      {label}
    </Button>
  )
}
