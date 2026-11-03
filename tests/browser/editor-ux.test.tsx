import type { Layout, Widget } from '@convex/lib/gmFormats'
import type * as ConvexReact from 'convex/react'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'

import { z } from '../../shared/zod'
import { LayoutEditor } from '../../src/features/gm/layout-editor'
import type {
  EditorDialog,
  ScreenMode,
} from '../../src/features/gm/layout-editor'
import { SaveControl } from '../../src/features/gm/widget-config'

const { mutation } = vi.hoisted(() => ({
  mutation: vi.fn().mockResolvedValue(1),
}))
vi.mock('convex/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReact>()),
  useMutation: () => mutation,
}))
vi.mock('../../src/components/draft-guard', () => ({ DraftGuard: () => null }))
vi.mock('../../src/features/gm/revision-history', () => ({
  RevisionHistory: () => null,
}))

const owned = {
  _creationTime: 0,
  ownerId: 'owner',
  projectId: 'project',
  screenId: 'screen',
  updatedAt: 0,
  formatVersion: 2,
  version: 0,
}
const checklist = z
  .custom<Widget>(() => true)
  .parse({
    ...owned,
    _id: 'checklist',
    kind: 'checklist',
    config: { title: 'Préparation', items: [{ id: 'a', label: 'Torches' }] },
    state: { checkedIds: [] },
  })
const dice = z
  .custom<Widget>(() => true)
  .parse({
    ...owned,
    _id: 'dice',
    kind: 'dice',
    config: { title: '', expression: '1d6' },
    state: {},
  })
const placement = (widgetId: string, x: number, layer: number) => ({
  widgetId,
  x,
  y: 0,
  width: 240,
  height: 200,
  layer,
})
function layout(outside = false) {
  return z
    .custom<Layout>(() => true)
    .parse({
      ...owned,
      _id: 'layout',
      kind: 'digital',
      unit: 'px',
      name: 'Écran',
      width: 1920,
      height: 1080,
      placements: [
        placement('checklist', 0, 0),
        placement('dice', outside ? 4000 : 300, 1),
      ],
    })
}

function Editor({
  mode = 'edit',
  outside = false,
}: {
  mode?: ScreenMode
  outside?: boolean
}) {
  const [dialog, setDialog] = useState<EditorDialog | null>(null)
  return (
    <>
      <button type="button" onClick={() => setDialog('goto')}>
        Ouvrir Aller au widget
      </button>
      <LayoutEditor
        layout={layout(outside)}
        notes={[checklist, dice]}
        variables={[]}
        mode={mode}
        locked={false}
        autoSave={false}
        grid={false}
        dialog={dialog}
        toolbarSlot={null}
        onDialogChange={setDialog}
        onDirtyChange={() => undefined}
        onProfileCreated={() => undefined}
      />
    </>
  )
}

test('edit mode keeps configuration out of the widget until the inspector opens, and keeps its draft', async () => {
  const screen = await render(<Editor />)
  await expect
    .element(screen.getByRole('button', { name: 'Déplacer la note 1' }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('checkbox', { name: 'Torches' }))
    .toBeVisible()
  expect(screen.getByLabelText('Titre du widget').elements()).toHaveLength(0)
  await screen.getByRole('button', { name: 'Configurer le widget 1' }).click()
  const inspector = screen.getByRole('dialog', { name: 'Inspecteur' })
  await expect.element(inspector).toBeVisible()
  await inspector.getByLabelText('Titre du widget').fill('Brouillon')
  await expect
    .element(inspector.getByRole('button', { name: 'Enregistrer le widget' }))
    .toBeEnabled()
  await screen.getByRole('button', { name: 'Fermer inspecteur' }).click()
  expect(
    screen.getByRole('dialog', { name: 'Inspecteur' }).elements()
  ).toHaveLength(0)
  // Fermé, le brouillon reste dans le widget : sa sauvegarde reste accessible.
  await expect
    .element(screen.getByRole('button', { name: 'Enregistrer le widget' }))
    .toBeVisible()
  await screen.getByRole('button', { name: 'Configurer le widget 1' }).click()
  await expect
    .element(screen.getByLabelText('Titre du widget'))
    .toHaveValue('Brouillon')
})

test('play mode hides the editing chrome but keeps widgets usable', async () => {
  const screen = await render(<Editor mode="play" />)
  await expect
    .element(screen.getByRole('checkbox', { name: 'Torches' }))
    .toBeEnabled()
  await expect
    .element(screen.getByRole('button', { name: 'Lancer' }))
    .toBeEnabled()
  for (const name of [
    'Déplacer la note 1',
    'Configurer le widget 1',
    'Actions du widget 1',
    'Redimensionner la note 1',
  ])
    expect(screen.getByRole('button', { name }).elements()).toHaveLength(0)
})

test('read mode renders widgets statically without any write control', async () => {
  mutation.mockClear()
  const screen = await render(<Editor mode="read" />)
  await expect.element(screen.getByText('☐ Torches')).toBeVisible()
  expect(screen.getByRole('checkbox').elements()).toHaveLength(0)
  expect(
    screen.getByRole('button', { name: 'Lancer' }).elements()
  ).toHaveLength(0)
  expect(mutation).not.toHaveBeenCalled()
})

test('shift-click builds a selection whose toolbar aligns, and Escape clears it', async () => {
  const screen = await render(<Editor />)
  await screen.getByRole('button', { name: 'Déplacer la note 1' }).click()
  await screen
    .getByRole('button', { name: 'Déplacer la note 2' })
    .click({ modifiers: ['Shift'] })
  const bar = screen.getByRole('toolbar', { name: 'Sélection de widgets' })
  await expect.element(bar.getByText('2 sélectionnés')).toBeVisible()
  await bar.getByRole('button', { name: 'Aligner' }).click()
  await expect
    .element(screen.getByRole('menuitem', { name: 'Aligner en haut' }))
    .toBeVisible()
  await expect
    .element(
      screen.getByRole('menuitem', { name: 'Distribuer horizontalement' })
    )
    .toHaveAttribute('aria-disabled', 'true')
  await userEvent.keyboard('{Escape}')
  await screen.getByRole('button', { name: 'Déplacer la note 1' }).click()
  await userEvent.keyboard('{Escape}')
  expect(
    screen.getByRole('toolbar', { name: 'Sélection de widgets' }).elements()
  ).toHaveLength(0)
})

test('Shift+F10 opens the widget menu, whose trash action writes the widget', async () => {
  mutation.mockClear()
  const screen = await render(<Editor />)
  const handle = screen.getByRole('button', { name: 'Déplacer la note 2' })
  await handle.click()
  await userEvent.keyboard('{Shift>}{F10}{/Shift}')
  await screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }).click()
  expect(mutation).toHaveBeenCalledWith(
    expect.objectContaining({
      operation: 'trash',
      notes: [{ id: 'dice', version: 0 }],
    })
  )
})

test('the ⋯ button and a right click both open the widget menu', async () => {
  const screen = await render(<Editor />)
  await screen.getByRole('button', { name: 'Actions du widget 1' }).click()
  await expect
    .element(screen.getByRole('menuitem', { name: 'Dupliquer' }))
    .toBeVisible()
  await userEvent.keyboard('{Escape}')
  await screen
    .getByRole('region', { name: 'Widget dice 2' })
    .click({ button: 'right' })
  await expect
    .element(screen.getByRole('menuitem', { name: 'Mettre à la corbeille' }))
    .toBeVisible()
})

test('a widget outside the frame is reachable through Aller au widget', async () => {
  const screen = await render(<Editor outside />)
  await screen.getByRole('button', { name: 'Ouvrir Aller au widget' }).click()
  // Dans ce banc de test, le fond interne du dialogue Base UI recouvre son
  // contenu : on active le bouton directement.
  const target = screen.getByRole('button', { name: /Dés 2.*hors cadre/ })
  await expect.element(target).toBeVisible()
  const button = target.element()
  if (button instanceof HTMLElement) button.click()
  const inspector = screen.getByRole('dialog', { name: 'Inspecteur' })
  await expect.element(inspector.getByLabelText('Position X')).toHaveValue(4000)
  await inspector.getByLabelText('Position X').fill('100')
  await expect.element(inspector.getByLabelText('Position X')).toHaveValue(100)
})

const draft = {
  dirty: true,
  pending: false,
  conflict: false,
  error: null,
  save: vi.fn().mockResolvedValue(undefined),
}

test('Enregistrer appears only when needed, retries after a failure and is blocked in conflict', async () => {
  const hidden = await render(
    <SaveControl editor={draft} autoSave label="Enregistrer" />
  )
  expect(hidden.getByRole('button').elements()).toHaveLength(0)
  const manual = await render(
    <SaveControl editor={draft} autoSave={false} label="Enregistrer" />
  )
  await expect
    .element(manual.getByRole('button', { name: 'Enregistrer' }))
    .toBeEnabled()
  draft.save.mockClear()
  const retry = await render(
    <SaveControl editor={{ ...draft, error: 'Échec' }} autoSave label="X" />
  )
  await retry
    .getByRole('button', { name: 'Réessayer l’enregistrement' })
    .click()
  expect(draft.save).toHaveBeenCalledOnce()
  const conflict = await render(
    <SaveControl
      editor={{ ...draft, error: 'Échec', conflict: true }}
      autoSave
      label="Enregistrer le widget"
    />
  )
  await expect
    .element(conflict.getByRole('button', { name: 'Enregistrer le widget' }))
    .toBeDisabled()
})
