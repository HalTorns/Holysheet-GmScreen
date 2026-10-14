import { api } from '@convex/_generated/api'
import { appConfig } from '@shared/app-config'
import { useMutation } from 'convex/react'
import { Pencil, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { operationErrorMessage } from '@/features/auth/errors'
import type { Resource } from '@/features/resources/types'

export function ResourceCard({
  resource,
  onEdit,
  canWrite = true,
}: {
  resource: Resource
  onEdit: () => void
  canWrite?: boolean
}) {
  const updatedAt = new Date(resource.updatedAt)
  return (
    <article className="resource-card panel">
      <h2>{resource.title}</h2>
      <p className="line-clamp-4">
        {resource.description || 'Pas encore de description.'}
      </p>
      <div className="resource-card-footer">
        <time dateTime={updatedAt.toISOString()}>
          Mis à jour le{' '}
          {updatedAt.toLocaleDateString(appConfig.locale, {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: appConfig.timeZone,
          })}
        </time>
        {canWrite && (
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon-sm"
              onClick={onEdit}
              aria-label={`Modifier ${resource.title}`}
            >
              <Pencil aria-hidden="true" />
            </Button>
            <DeleteResourceButton resource={resource} />
          </div>
        )}
      </div>
    </article>
  )
}

function DeleteResourceButton({ resource }: { resource: Resource }) {
  const removeResource = useMutation(api.resources.remove)
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function remove() {
    setIsPending(true)
    setError(null)
    try {
      await removeResource({ id: resource._id })
      setOpen(false)
      toast.success('Ressource supprimée.')
    } catch (error) {
      setError(operationErrorMessage(error))
    } finally {
      setIsPending(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) {
          setOpen(nextOpen)
          setError(null)
        }
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        aria-label={`Supprimer ${resource.title}`}
      >
        <Trash2 aria-hidden="true" />
      </DialogTrigger>
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>Supprimer cette ressource ?</DialogTitle>
          <DialogDescription>
            « {resource.title} » sera supprimée de votre espace. Cette action
            est définitive.
          </DialogDescription>
        </DialogHeader>
        {error && (
          <p className="field-error" role="alert">
            {error}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose
            render={<Button variant="outline" />}
            disabled={isPending}
          >
            Annuler
          </DialogClose>
          <Button
            variant="destructive"
            disabled={isPending}
            onClick={() => void remove()}
          >
            {isPending ? 'Suppression…' : 'Confirmer la suppression'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
