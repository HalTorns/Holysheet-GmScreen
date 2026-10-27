import { useCallback, useState } from 'react'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'

import { useEditorDraft } from '../../src/features/gm/use-editor-draft'

function Harness({
  persist,
  autoSave = false,
}: {
  persist: (body: string, version: number) => Promise<number>
  autoSave?: boolean
}) {
  const [server, setServer] = useState({ body: 'Initial', version: 0 })
  const save = useCallback(
    async (body: string, version: number) => {
      const next = await persist(body, version)
      setServer({ body, version: next })
      return next
    },
    [persist]
  )
  const editor = useEditorDraft({
    value: server.body,
    version: server.version,
    onSave: save,
    autoSave,
  })
  return (
    <div>
      <label>
        Texte
        <input
          value={editor.value}
          onChange={(event) => editor.edit(event.target.value)}
        />
      </label>
      <p role="status">{editor.status}</p>
      <button
        type="button"
        disabled={!editor.dirty || editor.pending || editor.conflict}
        onClick={() => void editor.save()}
      >
        Enregistrer
      </button>
      <button type="button" onClick={() => editor.discard()}>
        Charger la version distante
      </button>
      <button
        type="button"
        disabled={!editor.canUndo}
        onClick={() => void editor.undo()}
      >
        Annuler
      </button>
      <button
        type="button"
        disabled={!editor.canRedo}
        onClick={() => void editor.redo()}
      >
        Refaire
      </button>
      <button
        type="button"
        onClick={() => setServer({ body: 'Version distante', version: 100 })}
      >
        Autre fenêtre
      </button>
    </div>
  )
}

// Real React transitions own in-flight typing and debounce cancellation. Backend
// tests independently own the optimistic version check at the mutation boundary.
test('typing during a save is retained and rebased; undo/redo use acknowledged versions', async () => {
  let release!: (version: number) => void
  const persist = vi.fn(
    (_body: string, _version: number) =>
      new Promise<number>((resolve) => {
        release = resolve
      })
  )
  const screen = await render(<Harness persist={persist} />)
  const input = screen.getByRole('textbox', { name: 'Texte' })
  const save = screen.getByRole('button', { name: 'Enregistrer' })
  await input.fill('Première saisie')
  await save.click()
  await expect.poll(() => persist.mock.calls.length).toBe(1)
  await input.fill('Saisie pendant la sauvegarde')
  release(1)
  await expect.element(input).toHaveValue('Saisie pendant la sauvegarde')
  await expect.element(save).toBeEnabled()
  await save.click()
  expect(persist).toHaveBeenLastCalledWith('Saisie pendant la sauvegarde', 1)
  release(2)
  await expect
    .element(screen.getByRole('button', { name: 'Annuler', exact: true }))
    .toBeEnabled()
  await screen.getByRole('button', { name: 'Annuler', exact: true }).click()
  expect(persist).toHaveBeenLastCalledWith('Première saisie', 2)
  release(3)
  await expect.element(input).toHaveValue('Première saisie')
  await screen.getByRole('button', { name: 'Refaire', exact: true }).click()
  expect(persist).toHaveBeenLastCalledWith('Saisie pendant la sauvegarde', 3)
  release(4)
  await expect.element(input).toHaveValue('Saisie pendant la sauvegarde')
  await screen.getByRole('button', { name: 'Autre fenêtre' }).click()
  await expect.element(input).toHaveValue('Version distante')
  await expect
    .element(screen.getByRole('button', { name: 'Annuler', exact: true }))
    .toBeDisabled()
})

test('autosave persists an idle draft without a manual click', async () => {
  const persist = vi.fn((_body: string, version: number) =>
    Promise.resolve(version + 1)
  )
  const screen = await render(<Harness persist={persist} autoSave />)
  await screen
    .getByRole('textbox', { name: 'Texte' })
    .fill('Sauvegarde automatique')
  await expect.poll(() => persist.mock.calls.length, { timeout: 4000 }).toBe(1)
  expect(persist).toHaveBeenLastCalledWith('Sauvegarde automatique', 0)
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('Enregistré')
})

test('an external revision cancels autosave and preserves the unresolved draft', async () => {
  const persist = vi.fn((_body: string, version: number) =>
    Promise.resolve(version + 1)
  )
  const screen = await render(<Harness persist={persist} autoSave />)
  const input = screen.getByRole('textbox', { name: 'Texte' })
  await input.fill('Brouillon à conserver')
  await screen.getByRole('button', { name: 'Autre fenêtre' }).click()
  await expect
    .element(screen.getByRole('status'))
    .toHaveTextContent('Conflit à résoudre')
  await new Promise<void>((resolve) => {
    setTimeout(resolve, 1800)
  })
  expect(persist).not.toHaveBeenCalled()
  await expect.element(input).toHaveValue('Brouillon à conserver')
  await expect
    .element(screen.getByRole('button', { name: 'Enregistrer' }))
    .toBeDisabled()
  await screen
    .getByRole('button', { name: 'Charger la version distante' })
    .click()
  await expect.element(input).toHaveValue('Version distante')
})
