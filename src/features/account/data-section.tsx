import { useForm } from '@tanstack/react-form'
import { Link, useHydrated } from '@tanstack/react-router'
import { useConvex, useMutation } from 'convex/react'
import type { FunctionReturnType } from 'convex/server'
import { Download, FolderLock, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { z } from '@shared/zod'

import { api } from '@convex/_generated/api'
import { appConfig } from '@shared/app-config'
import { MAX_PAGE_SIZE } from '@shared/validation'
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
import { operationErrorMessage } from '@/features/auth/errors'
import { authClient } from '@/lib/auth-client'

type ExportPage = FunctionReturnType<typeof api.account.exportData>

export function DataSection() {
  return (
    <section className="security-section panel" aria-labelledby="data-heading">
      <div className="security-section-title">
        <div>
          <h2 id="data-heading">
            <FolderLock aria-hidden="true" />
            Vos données
          </h2>
          <p>
            Récupérez vos données ou supprimez votre compte. Ces actions
            demandent une connexion datant de moins de cinq minutes.
          </p>
        </div>
      </div>
      <div className="security-row">
        <div>
          <h3>Une copie de votre espace</h3>
          <p>
            Votre profil, vos ressources personnelles et vos appartenances dans
            un fichier JSON.
          </p>
        </div>
        <ExportDataButton />
      </div>
      <div className="security-row">
        <div>
          <h3>Supprimer votre compte</h3>
          <p>
            Votre accès sera fermé et vos données personnelles supprimées. Les
            ressources communes restent à leur organisation.
          </p>
        </div>
        <DeleteAccountDialog />
      </div>
      <p className="field-hint mt-4">
        Besoin de confirmer votre identité ?{' '}
        <Link to="/sign-in" className="text-primary underline">
          Se reconnecter
        </Link>
      </p>
    </section>
  )
}

function ExportDataButton() {
  const convex = useConvex()
  const [isPending, setIsPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function exportData() {
    setIsPending(true)
    setError(null)
    try {
      let cursor: string | null = null
      const resources: ExportPage['resources']['page'] = []
      let profile: ExportPage['profile'] | null = null
      let organizations: ExportPage['organizations'] = []
      let invitations: ExportPage['invitations'] = []
      let isDone = false
      while (!isDone) {
        const page: ExportPage = await convex.query(api.account.exportData, {
          paginationOpts: { numItems: MAX_PAGE_SIZE, cursor },
        })
        resources.push(...page.resources.page)
        profile = page.profile
        organizations = page.organizations
        invitations = page.invitations
        isDone = page.resources.isDone
        if (!isDone && cursor === page.resources.continueCursor)
          throw new Error('Export pagination did not progress')
        cursor = page.resources.continueCursor
      }
      downloadExport({
        profile,
        resources,
        organizations,
        invitations,
        exportedAt: new Date().toISOString(),
      })
    } catch (failure) {
      setError(operationErrorMessage(failure))
    } finally {
      setIsPending(false)
    }
  }
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => void exportData()}
      >
        <Download aria-hidden="true" />
        {isPending ? 'Export en cours…' : 'Exporter mes données'}
      </Button>
      {error && (
        <p className="field-error max-w-80 sm:text-right" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

function downloadExport(value: {
  profile: ExportPage['profile'] | null
  resources: ExportPage['resources']['page']
  organizations: ExportPage['organizations']
  invitations: ExportPage['invitations']
  exportedAt: string
}) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }),
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `${appConfig.exportPrefix}-export-${value.exportedAt.slice(0, 10)}.json`
  document.body.append(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

function DeleteAccountDialog() {
  const [open, setOpen] = useState(false)
  const [isPending, setIsPending] = useState(false)
  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isPending) setOpen(nextOpen)
      }}
    >
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        <Trash2 aria-hidden="true" />
        Supprimer mon compte
      </DialogTrigger>
      <DialogContent showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>Supprimer votre compte ?</DialogTitle>
          <DialogDescription>
            Cette action est définitive. Vos sessions seront fermées et vos
            ressources personnelles supprimées. Les données partagées restent à
            leur organisation, avec l’auteur anonymisé. Transférez vos
            organisations dont vous êtes le dernier propriétaire, ou
            supprimez-les avant de fermer votre compte.
          </DialogDescription>
        </DialogHeader>
        <DeleteAccountForm
          isPending={isPending}
          onPendingChange={setIsPending}
        />
      </DialogContent>
    </Dialog>
  )
}

function DeleteAccountForm({
  isPending,
  onPendingChange,
}: {
  isPending: boolean
  onPendingChange: (pending: boolean) => void
}) {
  const isHydrated = useHydrated()
  const deleteAccount = useMutation(api.account.deleteAccount)
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { confirmation: '' },
    validators: {
      onSubmit: z.object({
        confirmation: z.literal('SUPPRIMER', {
          error: 'Saisissez SUPPRIMER pour confirmer.',
        }),
      }),
    },
    onSubmit: async () => {
      setError(null)
      onPendingChange(true)
      try {
        await deleteAccount({ confirmation: 'DELETE' })
      } catch (failure) {
        setError(operationErrorMessage(failure))
        onPendingChange(false)
        return
      }
      try {
        await authClient.signOut()
      } catch {
        /* The deleted account is already inaccessible. */
      }
      window.location.assign('/')
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
      <form.Field name="confirmation">
        {(field) => (
          <div className="form-field">
            <label htmlFor="delete-confirmation">
              Saisissez SUPPRIMER pour confirmer
            </label>
            <Input
              id="delete-confirmation"
              name={field.name}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              autoComplete="off"
              aria-invalid={
                field.state.meta.isTouched && !field.state.meta.isValid
              }
              aria-describedby="delete-confirmation-error"
              required
              disabled={!isHydrated}
            />
            <FormError
              id="delete-confirmation-error"
              errors={field.state.meta.errors}
              isTouched={field.state.meta.isTouched}
            />
          </div>
        )}
      </form.Field>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <DialogClose render={<Button variant="outline" />} disabled={isPending}>
          Annuler
        </DialogClose>
        <Button
          type="submit"
          variant="destructive"
          disabled={!isHydrated || isPending}
        >
          {isPending ? 'Suppression…' : 'Supprimer définitivement mon compte'}
        </Button>
      </div>
    </form>
  )
}
