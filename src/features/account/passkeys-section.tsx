import { useForm } from '@tanstack/react-form'
import { useHydrated } from '@tanstack/react-router'
import {
  useMutation as useAuthMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useMutation } from 'convex/react'
import { Fingerprint, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { z } from '@shared/zod'

import { api } from '@convex/_generated/api'
import { FormError } from '@/components/form-error'
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
import { Input } from '@/components/ui/input'
import { formatAccountDate } from '@/features/account/format'
import {
  authOperationError,
  operationErrorMessage,
} from '@/features/auth/errors'
import { authClient } from '@/lib/auth-client'

const passkeysQueryKey = ['account', 'passkeys'] as const

export function PasskeysSection() {
  const [isAddOpen, setIsAddOpen] = useState(false)
  const passkeys = useQuery({
    queryKey: passkeysQueryKey,
    queryFn: async () => {
      const result = await authClient.passkey.listUserPasskeys()
      if (result.error) throw authOperationError(result.error)
      return result.data ?? []
    },
    retry: false,
    staleTime: 10_000,
  })

  return (
    <section
      className="security-section panel"
      aria-labelledby="passkeys-heading"
    >
      <div className="security-section-title">
        <div>
          <h2 id="passkeys-heading">
            <Fingerprint aria-hidden="true" />
            Vos passkeys
          </h2>
          <p>
            Connectez-vous avec votre empreinte, votre visage ou une clé de
            sécurité. Gardez toujours une passkey de secours.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setIsAddOpen(true)}>
          <Plus aria-hidden="true" />
          Ajouter une passkey
        </Button>
      </div>
      {passkeys.isPending && (
        <p className="field-hint" role="status">
          Chargement des passkeys…
        </p>
      )}
      {passkeys.isError && (
        <div className="grid justify-items-start gap-3">
          <p className="field-error" role="alert">
            {operationErrorMessage(
              passkeys.error,
              'Impossible de charger vos passkeys.',
            )}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void passkeys.refetch()}
          >
            Réessayer
          </Button>
        </div>
      )}
      {passkeys.data?.length === 0 && (
        <p className="field-hint border-t pt-5">
          Aucune passkey pour le moment. Ajoutez-en une pour votre prochaine
          connexion.
        </p>
      )}
      <div className="security-list">
        {passkeys.data?.map((passkey) => (
          <div className="security-row" key={passkey.id}>
            <div>
              <h3>{passkey.name || 'Passkey sans nom'}</h3>
              <p>
                Ajoutée le {formatAccountDate(passkey.createdAt)}
                {passkey.backedUp ? ' · Synchronisée' : ''}
              </p>
            </div>
            <RemovePasskeyButton
              id={passkey.id}
              name={passkey.name || 'sans nom'}
            />
          </div>
        ))}
      </div>
      <AddPasskeyDialog open={isAddOpen} onOpenChange={setIsAddOpen} />
    </section>
  )
}

function AddPasskeyDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const queryClient = useQueryClient()
  const add = useAuthMutation({
    mutationFn: async (name: string) => {
      const result = await authClient.passkey.addPasskey({ name })
      if (result.error) throw authOperationError(result.error)
      if (!result.data) throw new Error('Passkey registration cancelled')
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: passkeysQueryKey })
      toast.success('Passkey enregistrée.')
      onOpenChange(false)
    },
  })

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!add.isPending) {
          onOpenChange(nextOpen)
          add.reset()
        }
      }}
    >
      <DialogContent showCloseButton={!add.isPending}>
        <DialogHeader>
          <DialogTitle>Ajouter une passkey</DialogTitle>
          <DialogDescription>
            Choisissez un nom pour la reconnaître. Votre appareil vous demandera
            ensuite une confirmation.
          </DialogDescription>
        </DialogHeader>
        <PasskeyNameForm
          onSubmit={(name) => add.mutateAsync(name)}
          isPending={add.isPending}
          error={add.error}
        />
      </DialogContent>
    </Dialog>
  )
}

function PasskeyNameForm({
  onSubmit,
  isPending,
  error,
}: {
  onSubmit: (name: string) => Promise<void>
  isPending: boolean
  error: Error | null
}) {
  const isHydrated = useHydrated()
  const form = useForm({
    defaultValues: { name: 'Mon appareil' },
    validators: {
      onSubmit: z.object({
        name: z
          .string()
          .trim()
          .min(1, 'Donnez un nom à cette passkey.')
          .max(80, 'Le nom doit contenir 80 caractères maximum.'),
      }),
    },
    onSubmit: async ({ value }) => {
      try {
        await onSubmit(value.name.trim())
      } catch {
        /* The mutation presents its safe error below. */
      }
    },
  })
  return (
    <form
      method="post"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
      className="grid gap-5"
    >
      <form.Field name="name">
        {(field) => (
          <div className="form-field">
            <label htmlFor="passkey-name">Nom de la passkey</label>
            <Input
              id="passkey-name"
              name={field.name}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              maxLength={80}
              aria-invalid={
                field.state.meta.isTouched && !field.state.meta.isValid
              }
              aria-describedby="passkey-name-error"
              required
              disabled={!isHydrated}
            />
            <FormError
              id="passkey-name-error"
              errors={field.state.meta.errors}
              isTouched={field.state.meta.isTouched}
            />
          </div>
        )}
      </form.Field>
      {error && (
        <p className="field-error" role="alert">
          {operationErrorMessage(
            error,
            'L’ajout de la passkey a été annulé ou a échoué. Une connexion récente est nécessaire.',
          )}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose render={<Button variant="outline" />} disabled={isPending}>
          Annuler
        </DialogClose>
        <Button type="submit" disabled={!isHydrated || isPending}>
          {isPending
            ? 'Confirmation sur votre appareil…'
            : 'Enregistrer la passkey'}
        </Button>
      </div>
    </form>
  )
}

function RemovePasskeyButton({ id, name }: { id: string; name: string }) {
  const queryClient = useQueryClient()
  const removePasskey = useMutation(api.account.removePasskey)
  const [open, setOpen] = useState(false)
  const remove = useAuthMutation({
    mutationFn: () => removePasskey({ id }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: passkeysQueryKey })
      setOpen(false)
      toast.success('Passkey supprimée.')
    },
  })
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!remove.isPending) {
          setOpen(nextOpen)
          remove.reset()
        }
      }}
    >
      <DialogTrigger
        render={<Button variant="ghost" size="icon-sm" />}
        aria-label={`Supprimer la passkey ${name}`}
      >
        <Trash2 aria-hidden="true" />
      </DialogTrigger>
      <DialogContent showCloseButton={!remove.isPending}>
        <DialogHeader>
          <DialogTitle>Supprimer cette passkey ?</DialogTitle>
          <DialogDescription>
            La passkey « {name} » ne pourra plus vous connecter. Votre dernière
            passkey doit être conservée.
          </DialogDescription>
        </DialogHeader>
        {remove.error && (
          <p className="field-error" role="alert">
            {operationErrorMessage(remove.error)}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <DialogClose
            render={<Button variant="outline" />}
            disabled={remove.isPending}
          >
            Annuler
          </DialogClose>
          <Button
            variant="destructive"
            disabled={remove.isPending}
            onClick={() => remove.mutate()}
          >
            {remove.isPending ? 'Suppression…' : 'Supprimer la passkey'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
