import { api } from '@convex/_generated/api'
import { otpSchema } from '@shared/validation'
import { useAction } from 'convex/react'
import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'

import { FormDialogContent as DialogContent } from '@/components/form-dialog-content'
import { Button } from '@/components/ui/button'
import { Dialog, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import { operationErrorMessage } from './errors'

const ConfirmationContext = createContext<
  ((operation: string) => Promise<boolean>) | null
>(null)

export function useIdentityConfirmation() {
  const confirm = useContext(ConfirmationContext)
  if (!confirm) throw new Error('Identity confirmation provider is missing')
  return confirm
}
export function IdentityConfirmationProvider({
  children,
}: {
  children: ReactNode
}) {
  const request = useAction(api.identityConfirmation.request)
  const verify = useAction(api.identityConfirmation.verify)
  const [operation, setOperation] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const codeInput = useRef<HTMLInputElement>(null)
  const returnFocus = useRef<HTMLElement | null>(null)
  useEffect(() => {
    if (sent && !pending) codeInput.current?.focus()
  }, [sent, pending])
  const completion = useRef<((confirmed: boolean) => void) | null>(null)
  useEffect(
    () => () => {
      completion.current?.(false)
      completion.current = null
    },
    []
  )
  function finish(confirmed: boolean) {
    completion.current?.(confirmed)
    completion.current = null
    setOperation(null)
    setCode('')
    setError(null)
    setSent(false)
    requestAnimationFrame(() => returnFocus.current?.focus())
  }
  const send = useCallback(
    async (nextOperation: string) => {
      setPending(true)
      setError(null)
      try {
        await request({ operation: nextOperation })
        setSent(true)
      } catch (error) {
        setError(operationErrorMessage(error))
      } finally {
        setPending(false)
      }
    },
    [request]
  )
  const confirm = useCallback(
    (nextOperation: string) => {
      if (completion.current) return Promise.resolve(false)
      returnFocus.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null
      setOperation(nextOperation)
      setCode('')
      setSent(false)
      void send(nextOperation)
      return new Promise<boolean>((resolve) => {
        completion.current = resolve
      })
    },
    [send]
  )
  async function submit() {
    if (!operation || pending) return
    const parsed = otpSchema.safeParse(code)
    if (!parsed.success) {
      setError('Saisissez le code à 6 chiffres.')
      return
    }
    setPending(true)
    setError(null)
    try {
      if (await verify({ operation, code: parsed.data })) finish(true)
      else
        setError(
          'Code incorrect, expiré ou déjà utilisé. Demandez un nouveau code si nécessaire.'
        )
    } catch (error) {
      setError(operationErrorMessage(error))
    } finally {
      setPending(false)
    }
  }
  return (
    <ConfirmationContext value={confirm}>
      {children}
      <Dialog
        open={operation !== null}
        onOpenChange={(open) => {
          if (!open && !pending) finish(false)
        }}
      >
        <DialogContent showCloseButton={!pending}>
          <DialogTitle>Confirmer votre identité</DialogTitle>
          <DialogDescription>
            Un code est envoyé à l’adresse de votre compte pour autoriser cette
            action. Votre formulaire est conservé.
          </DialogDescription>
          <form
            className="grid gap-4"
            onSubmit={(event) => {
              event.preventDefault()
              event.stopPropagation()
              void submit()
            }}
          >
            <label htmlFor="identity-code">
              Code de confirmation d’identité
            </label>
            <Input
              ref={codeInput}
              id="identity-code"
              type="password"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value)}
              disabled={pending || !sent}
              aria-describedby="identity-error"
            />
            {error && (
              <p id="identity-error" role="alert" className="field-error">
                {error}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => {
                  if (operation) void send(operation)
                }}
              >
                {sent ? 'Renvoyer un code' : 'Réessayer l’envoi'}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => finish(false)}
              >
                Annuler la confirmation
              </Button>
              <Button type="submit" disabled={pending || !sent}>
                {pending ? 'Vérification…' : 'Confirmer et continuer'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </ConfirmationContext>
  )
}
