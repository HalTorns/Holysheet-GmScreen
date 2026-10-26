import { gmTitle } from '@shared/gm'
import { z } from '@shared/zod'
import { useForm } from '@tanstack/react-form'
import { useState } from 'react'

import { FormTextField } from '@/components/form-text-field'
import { Button } from '@/components/ui/button'
import { operationErrorMessage } from '@/features/auth/errors'

export function TitleForm({
  label,
  onCreate,
}: {
  label: string
  onCreate: (title: string) => Promise<unknown>
}) {
  const [error, setError] = useState<string | null>(null)
  const form = useForm({
    defaultValues: { title: '' },
    validators: { onSubmit: z.object({ title: gmTitle }) },
    onSubmit: async ({ value }) => {
      setError(null)
      try {
        await onCreate(value.title)
        form.reset()
      } catch (error) {
        setError(operationErrorMessage(error))
      }
    },
  })
  const id = label.replaceAll(' ', '-')
  return (
    <form
      className="grid gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="title">
        {(field) => (
          <FormTextField
            id={id}
            label={label}
            name={field.name}
            value={field.state.value}
            onChange={(event) => field.handleChange(event.target.value)}
            onBlur={field.handleBlur}
            required
            maxLength={120}
            errors={field.state.meta.errors}
            isTouched={field.state.meta.isTouched}
          />
        )}
      </form.Field>
      <form.Subscribe selector={(state) => state.isSubmitting}>
        {(pending) => (
          <Button type="submit" disabled={pending}>
            {pending ? 'Création…' : label}
          </Button>
        )}
      </form.Subscribe>
      {error && (
        <p role="alert" className="field-error">
          {error}
        </p>
      )}
    </form>
  )
}
