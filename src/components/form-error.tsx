function getValidationMessage(error: unknown): string | null {
  if (typeof error === 'string') return error
  if (
    error &&
    typeof error === 'object' &&
    'message' in error &&
    typeof error.message === 'string'
  )
    return error.message
  return null
}

export function FormError({
  id,
  errors,
  isTouched = true,
}: {
  id?: string
  errors: readonly unknown[]
  isTouched?: boolean
}) {
  const message = isTouched
    ? errors.map(getValidationMessage).filter(Boolean).join(' ')
    : ''
  if (!message) return null
  return (
    <p id={id} className="field-error" role="alert">
      {message}
    </p>
  )
}
