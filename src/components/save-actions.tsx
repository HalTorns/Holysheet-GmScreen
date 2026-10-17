import { Button } from '@/components/ui/button'

export function SaveActions({
  pending,
  disabled,
  label = 'Enregistrer',
  onCancel,
}: {
  pending: boolean
  disabled?: boolean
  label?: string
  onCancel?: () => void
}) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-wrap justify-end gap-2 border-t bg-background py-3">
      {onCancel && (
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={onCancel}
        >
          Annuler
        </Button>
      )}
      <Button
        type="submit"
        disabled={pending || disabled}
        className="min-h-11 w-full sm:w-auto"
      >
        {pending ? 'Enregistrement…' : label}
      </Button>
    </div>
  )
}
