import type { Id } from '@convex/_generated/dataModel'
import type { Widget } from '@convex/lib/gmFormats'
import type * as ConvexReact from 'convex/react'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'

import { z } from '../../shared/zod'
import { WidgetContent } from '../../src/features/gm/typed-widget'

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

const widget: Extract<Widget, { kind: 'checklist' }> = {
  _id: z
    .custom<Id<'gmNotes'>>((value) => value === 'checklist')
    .parse('checklist'),
  _creationTime: 0,
  ownerId: 'owner',
  projectId: z
    .custom<Id<'gmProjects'>>((value) => value === 'project')
    .parse('project'),
  screenId: z
    .custom<Id<'gmScreens'>>((value) => value === 'screen')
    .parse('screen'),
  updatedAt: 0,
  formatVersion: 2,
  version: 0,
  kind: 'checklist',
  config: {
    title: 'Préparation',
    items: [
      { id: 'a', label: 'Torches' },
      { id: 'b', label: 'Cordes' },
    ],
  },
  state: { checkedIds: [] },
}
const base = {
  variables: [],
  index: 0,
  readOnly: false,
  locked: false,
  autoSave: false,
  onDirtyChange: () => undefined,
}

test('checkboxes write immediately with explicit state and remain enabled under layout lock', async () => {
  mutation.mockClear()
  const screen = await render(<WidgetContent {...base} note={widget} locked />)
  await expect
    .element(screen.getByLabelText('Titre du widget', { exact: true }))
    .toBeDisabled()
  await screen.getByRole('checkbox', { name: 'Torches', exact: true }).click()
  expect(mutation).toHaveBeenCalledWith({
    id: widget._id,
    expectedVersion: 0,
    itemId: 'a',
    checked: true,
  })
  await screen.rerender(
    <WidgetContent
      {...base}
      note={{ ...widget, version: 1, state: { checkedIds: ['a'] } }}
      locked
    />
  )
  await expect
    .element(screen.getByRole('checkbox', { name: 'Torches', exact: true }))
    .toBeChecked()
})

test('reorder preserves cases and configuration drafts survive a remote conflict', async () => {
  mutation.mockClear()
  const checked = { ...widget, state: { checkedIds: ['a'] } }
  const screen = await render(<WidgetContent {...base} note={checked} />)
  await screen
    .getByRole('button', { name: 'Monter Cordes', exact: true })
    .click()
  await expect
    .element(screen.getByRole('textbox', { name: 'Libellé 1', exact: true }))
    .toHaveValue('Cordes')
  await expect
    .element(screen.getByRole('checkbox', { name: 'Torches', exact: true }))
    .toBeChecked()
  await screen
    .getByLabelText('Titre du widget', { exact: true })
    .fill('Brouillon')
  expect(mutation).not.toHaveBeenCalled()
  await screen.rerender(
    <WidgetContent
      {...base}
      note={{
        ...checked,
        version: 2,
        config: { ...checked.config, title: 'Distant' },
      }}
    />
  )
  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent(/brouillon est conservé/)
  await expect
    .element(screen.getByLabelText('Titre du widget', { exact: true }))
    .toHaveValue('Brouillon')
  await expect
    .element(
      screen.getByRole('button', { name: 'Enregistrer le widget', exact: true })
    )
    .toBeDisabled()
  await screen
    .getByRole('button', {
      name: 'Charger la version enregistrée',
      exact: true,
    })
    .click()
  await expect
    .element(screen.getByLabelText('Titre du widget', { exact: true }))
    .toHaveValue('Distant')
})

test('read-only rendering contains state and no writable controls', async () => {
  const screen = await render(
    <WidgetContent
      {...base}
      note={{ ...widget, state: { checkedIds: ['a'] } }}
      readOnly
    />
  )
  await expect
    .element(screen.getByText('☑ Torches', { exact: true }))
    .toBeVisible()
  expect(screen.container.querySelectorAll('input,button,select')).toHaveLength(
    0
  )
})

// The prior checklist test resolves immediately. A delayed clock response must
// still show the segment click before the server subscription updates.
test('clock segments respond optimistically under lock and synchronize the returned state', async () => {
  let finish:
    | ((value: { version: number; serverNow: number }) => void)
    | undefined
  mutation.mockImplementationOnce(
    () =>
      new Promise<{ version: number; serverNow: number }>((resolve) => {
        finish = resolve
      })
  )
  const clock: Extract<Widget, { kind: 'clock' }> = {
    ...widget,
    kind: 'clock',
    config: { title: 'Danger', mode: 'segments', segments: 4 },
    state: { filled: 0 },
  }
  const screen = await render(<WidgetContent {...base} note={clock} locked />)
  await screen.getByRole('checkbox', { name: 'Segment 2', exact: true }).click()
  await expect
    .element(screen.getByRole('checkbox', { name: 'Segment 1', exact: true }))
    .toBeChecked()
  await expect
    .element(screen.getByRole('checkbox', { name: 'Segment 2', exact: true }))
    .toBeChecked()
  expect(mutation).toHaveBeenLastCalledWith({
    id: widget._id,
    expectedVersion: 0,
    action: { filled: 2 },
  })
  if (!finish) throw new Error('Missing pending clock request')
  finish({ version: 1, serverNow: Date.now() })
  await screen.rerender(
    <WidgetContent
      {...base}
      note={{ ...clock, version: 1, state: { filled: 2 } }}
      locked
    />
  )
  await expect
    .element(screen.getByRole('checkbox', { name: 'Segment 2', exact: true }))
    .toBeChecked()
  await expect
    .element(screen.getByRole('checkbox', { name: 'Segment 3', exact: true }))
    .not.toBeChecked()
})

test('initiative marks the next participant immediately and keeps a concurrent draft until explicitly discarded', async () => {
  mutation.mockClear()
  const initiative: Extract<Widget, { kind: 'initiative' }> = {
    ...widget,
    kind: 'initiative',
    config: { title: 'Combat' },
    state: {
      entries: [
        { id: 'a', name: 'A', score: 10, note: '' },
        { id: 'b', name: 'B', score: 5, note: '' },
      ],
      round: 1,
    },
  }
  const screen = await render(<WidgetContent {...base} note={initiative} />)
  await screen
    .getByRole('button', { name: 'Tour suivant', exact: true })
    .click()
  expect(
    screen.container.querySelector('[aria-current="true"]')?.textContent
  ).toContain('Tour actuel')
  expect(mutation).toHaveBeenLastCalledWith({
    id: widget._id,
    expectedVersion: 0,
    widget: {
      kind: 'initiative',
      config: initiative.config,
      state: { ...initiative.state, currentId: 'a' },
    },
  })
  await screen.rerender(
    <WidgetContent
      {...base}
      note={{
        ...initiative,
        version: 1,
        state: { ...initiative.state, currentId: 'a' },
      }}
    />
  )
  await screen
    .getByLabelText('Titre du widget', { exact: true })
    .fill('Brouillon')
  await screen.rerender(
    <WidgetContent
      {...base}
      note={{ ...initiative, version: 2, config: { title: 'Distant' } }}
    />
  )
  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent(/brouillon est conservé/)
  await expect
    .element(screen.getByRole('button', { name: 'Tour suivant', exact: true }))
    .toBeDisabled()
  await screen
    .getByRole('button', {
      name: 'Charger la version enregistrée',
      exact: true,
    })
    .click()
  await expect
    .element(screen.getByLabelText('Titre du widget', { exact: true }))
    .toHaveValue('Distant')
})
