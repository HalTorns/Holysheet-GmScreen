import type { api } from '@convex/_generated/api'
import type { Widget } from '@convex/lib/gmFormats'
import type * as Router from '@tanstack/react-router'
import type * as ConvexReact from 'convex/react'
import { getFunctionName } from 'convex/server'
import type { FunctionReturnType } from 'convex/server'
import type { ReactNode } from 'react'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'

import { z } from '../../shared/zod'
import { MerchantStock } from '../../src/features/gm/merchant-stock'
import { WidgetContent } from '../../src/features/gm/typed-widget'

type Rows = FunctionReturnType<typeof api.merchants.getStock>
const { state, mutation } = vi.hoisted(() => ({
  state: { rows: [] as Rows },
  mutation: vi.fn().mockResolvedValue(1),
}))
vi.mock('convex/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReact>()),
  useMutation: () => mutation,
  useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
    const name = getFunctionName(reference)
    if (name === 'merchants:getStock') return state.rows
    if (name === 'gmSheets:searchSheets') return []
    if (name === 'gmWidgets:getSheetPreview')
      return {
        status: 'ok',
        sheet: {
          _id: 'merchant',
          kind: 'merchant',
          title: 'Alchimiste',
          summary: '',
        },
      }
    return null
  },
}))
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof Router>()),
  Link: ({ children }: { children: ReactNode }) => <span>{children}</span>,
}))
vi.mock('../../src/components/draft-guard', () => ({ DraftGuard: () => null }))
vi.mock('../../src/features/gm/revision-history', () => ({
  RevisionHistory: () => null,
}))
const widget = z.custom<Extract<Widget, { kind: 'sheet' }>>().parse({
  _id: 'widget',
  _creationTime: 0,
  ownerId: 'owner',
  projectId: 'project',
  screenId: 'screen',
  updatedAt: 0,
  version: 0,
  formatVersion: 2,
  kind: 'sheet',
  config: { title: '', sheetId: 'merchant', display: 'full', fieldLabels: [] },
  state: {},
})
function rows() {
  return z.custom<Rows>().parse([
    {
      _id: 'row',
      merchantId: 'merchant',
      itemId: 'item',
      quantity: 5,
      version: 0,
      available: true,
      order: 0,
      effectivePrice: 10,
      item: {
        title: 'Potion',
        deleted: false,
        currency: 'po',
        category: 'Potion',
      },
    },
    {
      _id: 'unlimited',
      merchantId: 'merchant',
      itemId: 'corde',
      quantity: null,
      version: 0,
      available: false,
      order: 1,
      item: { title: 'Corde', deleted: false, currency: '', category: '' },
    },
    {
      _id: 'trashed',
      merchantId: 'merchant',
      itemId: 'old',
      quantity: 0,
      version: 0,
      available: true,
      order: 2,
      item: { title: 'Ancien', deleted: true, currency: '', category: '' },
    },
  ])
}
const base = {
  variables: [],
  index: 0,
  readOnly: false,
  locked: false,
  autoSave: false,
  onDirtyChange: () => undefined,
}

test('stock table edits absolute values, represents unavailable/unlimited rows and keeps a draft after a live sale', async () => {
  state.rows = rows()
  mutation.mockClear()
  const screen = await render(
    <MerchantStock
      merchantId={
        widget.config.sheetId ??
        z.custom<NonNullable<typeof widget.config.sheetId>>().parse('merchant')
      }
      projectId={widget.projectId}
    />
  )
  const potion = screen.getByRole('row').filter({ hasText: 'Potion' })
  const corde = screen.getByRole('row').filter({ hasText: 'Corde' })
  await expect
    .element(corde.getByLabelText('Illimité', { exact: true }))
    .toBeChecked()
  await expect
    .element(corde.getByLabelText('Quantité', { exact: true }))
    .toBeDisabled()
  await expect
    .element(
      screen.getByText('Objet indisponible (en corbeille)', { exact: true })
    )
    .toBeVisible()
  await potion.getByLabelText('Quantité', { exact: true }).fill('8')
  await potion.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  expect(mutation).toHaveBeenCalledWith({
    id: 'row',
    expectedVersion: 0,
    quantity: 8,
    available: true,
  })
  await potion.getByLabelText('Quantité', { exact: true }).fill('9')
  state.rows = state.rows.map((row) =>
    row._id === 'row' ? { ...row, version: 2, quantity: 7 } : row
  )
  await screen.rerender(
    <MerchantStock
      merchantId={z
        .custom<NonNullable<typeof widget.config.sheetId>>()
        .parse('merchant')}
      projectId={widget.projectId}
    />
  )
  await expect
    .element(potion.getByLabelText('Quantité', { exact: true }))
    .toHaveValue(9)
  await expect
    .element(potion.getByRole('alert'))
    .toHaveTextContent('Cette ligne a changé. Votre brouillon est conservé.')
  await expect
    .element(potion.getByRole('button', { name: 'Enregistrer', exact: true }))
    .toBeDisabled()
})

test('actual sheet widget sells atomically, follows live stock, disables locked controls and renders static quantities and prices', async () => {
  state.rows = rows()
  mutation.mockClear()
  const screen = await render(<WidgetContent {...base} note={widget} />)
  await screen
    .getByRole('button', { name: 'Vendre Potion', exact: true })
    .click()
  expect(mutation).toHaveBeenCalledWith({ id: 'row', delta: -1 })
  state.rows = state.rows.map((row) =>
    row._id === 'row' ? { ...row, quantity: 4, version: 1 } : row
  )
  await screen.rerender(<WidgetContent {...base} note={widget} locked />)
  await expect
    .element(screen.getByLabelText('Stock Potion', { exact: true }))
    .toHaveTextContent('4')
  await expect
    .element(screen.getByRole('button', { name: 'Vendre Potion', exact: true }))
    .toBeDisabled()
  await expect
    .element(screen.getByRole('button', { name: 'Vendre Corde', exact: true }))
    .toBeDisabled()
  await screen.rerender(<WidgetContent {...base} note={widget} readOnly />)
  await expect
    .element(screen.getByLabelText('Stock Potion', { exact: true }))
    .toHaveTextContent('4')
  await expect
    .element(screen.getByText('Potion · 10 po ·', { exact: false }))
    .toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'Vendre Potion', exact: true }))
    .not.toBeInTheDocument()
})
