import type { ComponentProps } from 'react'

import { FormError } from '@/components/form-error'
import { Input } from '@/components/ui/input'

const NO_ERRORS: readonly unknown[] = []

export function FormTextField({
  label,
  errors = NO_ERRORS,
  isTouched = false,
  ...props
}: Omit<
  ComponentProps<typeof Input>,
  'id' | 'aria-invalid' | 'aria-describedby'
> & {
  id: string
  label: string
  errors?: readonly unknown[]
  isTouched?: boolean
}) {
  const errorId = `${props.id}-error`
  return (
    <div className="form-field">
      <label htmlFor={props.id}>{label}</label>
      <Input
        {...props}
        aria-invalid={isTouched && errors.length > 0}
        aria-describedby={isTouched && errors.length > 0 ? errorId : undefined}
      />
      <FormError id={errorId} errors={errors} isTouched={isTouched} />
    </div>
  )
}
