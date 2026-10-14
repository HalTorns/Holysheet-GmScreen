import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'

import { FormTextField } from '../../src/components/form-text-field'

// E2E owns real auth delivery/validation. Browser Mode owns the reusable field's
// accessible label, inline error association and disabled interaction state.
test('a field associates errors only after interaction and can be locked during submission', async () => {
  const screen = await render(
    <FormTextField
      id="email"
      label="Adresse email"
      errors={[{ message: 'Adresse invalide' }]}
    />
  )
  const input = screen.getByRole('textbox', { name: 'Adresse email' })
  await expect.element(input).not.toHaveAttribute('aria-describedby')
  await expect.element(screen.getByRole('alert')).not.toBeInTheDocument()
  await screen.rerender(
    <FormTextField
      id="email"
      label="Adresse email"
      errors={[{ message: 'Adresse invalide' }]}
      isTouched
      disabled
    />
  )
  await expect.element(input).toHaveAccessibleDescription('Adresse invalide')
  await expect.element(input).toHaveAttribute('aria-invalid', 'true')
  await expect.element(input).toBeDisabled()
})
