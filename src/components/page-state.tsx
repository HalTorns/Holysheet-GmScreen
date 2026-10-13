import { AlertCircle, LoaderCircle } from 'lucide-react'

import { Button } from '@/components/ui/button'

export function LoadingState({
  label = 'Chargement de votre espace…',
}: {
  label?: string
}) {
  return (
    <div className="page-state" role="status">
      <LoaderCircle className="size-5 text-primary" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

export function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="page-state" role="alert">
      <AlertCircle className="size-5 text-destructive" aria-hidden="true" />
      <h2 className="font-semibold">Impossible de charger cette page.</h2>
      <p>Vérifiez votre connexion, puis réessayez.</p>
      <Button
        variant="outline"
        onClick={onRetry ?? (() => window.location.reload())}
      >
        Réessayer
      </Button>
    </div>
  )
}
