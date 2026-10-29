import { useState } from 'react'
import { expect, test } from 'vitest'
import { render } from 'vitest-browser-react'

import { useRetained } from '../../src/hooks/use-retained'

// Une requête qui repasse à undefined ne doit ni démonter l'écran ni effacer
// l'état local ; une réponse null (ressource disparue) doit rester visible.
function Probe({ value }: { value: string | null | undefined }) {
  const retained = useRetained(value)
  const [draft, setDraft] = useState('')
  if (retained === undefined) return <p>Chargement</p>
  if (retained === null) return <p>Introuvable</p>
  return (
    <label>
      {retained}
      <input value={draft} onChange={(event) => setDraft(event.target.value)} />
    </label>
  )
}

test('a transient undefined keeps the last response and local state, null is shown', async () => {
  const screen = await render(<Probe value={undefined} />)
  await expect.element(screen.getByText('Chargement')).toBeVisible()
  await screen.rerender(<Probe value="Écran" />)
  await screen.getByRole('textbox').fill('brouillon')
  await screen.rerender(<Probe value={undefined} />)
  await expect.element(screen.getByRole('textbox')).toHaveValue('brouillon')
  await screen.rerender(<Probe value="Écran 2" />)
  await expect.element(screen.getByText('Écran 2')).toBeVisible()
  await screen.rerender(<Probe value={null} />)
  await expect.element(screen.getByText('Introuvable')).toBeVisible()
})
