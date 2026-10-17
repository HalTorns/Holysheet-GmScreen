import { useBlocker } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'

export function DraftGuard({ dirty }: { dirty: boolean }) {
  const blocker = useBlocker({
    shouldBlockFn: () => dirty,
    withResolver: true,
    enableBeforeUnload: dirty,
  })
  return (
    <Dialog
      open={blocker.status === 'blocked'}
      onOpenChange={(open) => {
        if (!open) blocker.reset?.()
      }}
    >
      <DialogContent>
        <DialogTitle>Quitter sans enregistrer ?</DialogTitle>
        <DialogDescription>
          Vos modifications ne sont pas encore enregistrées.
        </DialogDescription>
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => blocker.reset?.()}>
            Rester
          </Button>
          <Button variant="destructive" onClick={() => blocker.proceed?.()}>
            Quitter sans enregistrer
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
