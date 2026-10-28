import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { ConvexHttpClient } from 'convex/browser'

import { readScreen } from '../helpers/gm-screen'
import { waitForHydration } from './helpers'

export async function verifyWidgetTools(page: Page, client: ConvexHttpClient) {
  const id = new URL(page.url()).pathname.split('/').at(-1) ?? ''
  async function read() {
    const data = await readScreen(client, { id })
    if (!data) throw new Error('Missing Screen')
    return data
  }
  const original = await read()
  const first = original.notes[0]
  if (!first) throw new Error('Missing note')
  const selected = page.getByRole('combobox', { name: 'Note sélectionnée' })
  await selected.selectOption(first._id)
  await page.getByRole('button', { name: 'Dupliquer', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Contenu de la note', exact: true })
  ).toHaveCount(3)
  const copy = (await read()).notes.find(
    (n) => !original.notes.some((previous) => previous._id === n._id)
  )
  if (!copy) throw new Error('Missing duplicate')
  await page
    .getByRole('textbox', { name: 'Contenu de la note', exact: true })
    .nth(2)
    .fill('Copie de référence indépendante')
  await expect
    .poll(
      async () => (await read()).notes.find((n) => n._id === copy._id)?.body
    )
    .toBe('Copie de référence indépendante')
  expect((await read()).notes.find((n) => n._id === first._id)?.body).toBe(
    first.body
  )
  await page
    .getByText('Sélection, groupes et alignement', { exact: true })
    .click()
  await page
    .getByRole('checkbox', { name: 'Sélectionner la note 1', exact: true })
    .check()
  await page
    .getByRole('checkbox', { name: 'Sélectionner la note 3', exact: true })
    .check()
  await page.getByRole('button', { name: 'Grouper', exact: true }).click()
  const digital = original.layouts.find((p) => p.name === 'Portable')
  if (!digital) throw new Error('Missing profile')
  const profile = async () => {
    const layout = (await read()).layouts.find((p) => p._id === digital._id)
    if (!layout) throw new Error('Missing profile')
    return layout
  }
  await expect
    .poll(
      async () =>
        (await profile()).placements.find((p) => p.widgetId === first._id)
          ?.groupId
    )
    .toBe(first._id)
  const before = await profile()
  const firstPlacement = before.placements.find((p) => p.widgetId === first._id)
  const copyPlacement = before.placements.find((p) => p.widgetId === copy._id)
  if (!firstPlacement || !copyPlacement)
    throw new Error('Missing group placements')
  const moveHandle = page.getByRole('button', {
    name: 'Déplacer la note 1',
    exact: true,
  })
  await expect(moveHandle).toBeEnabled()
  await moveHandle.press('ArrowRight')
  await expect
    .poll(
      async () =>
        (await profile()).placements.find((p) => p.widgetId === copy._id)?.x
    )
    .toBe(copyPlacement.x + 1)
  expect(
    (await profile()).placements.find((p) => p.widgetId === first._id)?.x
  ).toBe(firstPlacement.x + 1)
  await page.getByText('Style des notes sélectionnées', { exact: true }).click()
  await page
    .getByRole('spinbutton', { name: 'Taille du texte', exact: true })
    .fill('20')
  await expect
    .poll(
      async () =>
        (await profile()).placements.find((p) => p.widgetId === copy._id)?.style
          ?.fontSize
    )
    .toBe(20)
  expect(
    (await profile()).placements.find((p) => p.widgetId === first._id)?.style
      ?.fontSize
  ).toBe(20)
  await expect(
    page
      .getByRole('textbox', { name: 'Contenu de la note', exact: true })
      .nth(2)
  ).toHaveCSS('font-size', '20px')
  const bureau = original.layouts.find(
    (p) => p.kind === 'digital' && p._id !== digital._id
  )
  expect(
    (await read()).layouts.find((p) => p._id === bureau?._id)?.placements[0]
      ?.style
  ).toBeUndefined()
  await page
    .getByRole('button', { name: 'Copier les widgets', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Coller les widgets', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Contenu de la note', exact: true })
  ).toHaveCount(5)
  await selected.selectOption(copy._id)
  await page
    .getByRole('button', { name: 'Mettre à la corbeille', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Contenu de la note', exact: true })
  ).toHaveCount(4)
  await page.getByRole('button', { name: 'Corbeille', exact: true }).click()
  await expect(
    page
      .getByRole('dialog')
      .getByText('Copie de référence indépendante', { exact: true })
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Restaurer cette note', exact: true })
    .click()
  await expect(
    page.getByText('La corbeille est vide.', { exact: true })
  ).toBeVisible()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Fermer', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Contenu de la note', exact: true })
  ).toHaveCount(5)
  const restored = (await profile()).placements.find(
    (p) => p.widgetId === copy._id
  )
  expect(restored).toMatchObject({
    x: copyPlacement.x + 1,
    style: { fontSize: 20 },
  })
  expect(restored?.groupId).toBeUndefined()
  // Leave a recoverable trash record in the real snapshot/restore fixture.
  await selected.selectOption(copy._id)
  await page
    .getByRole('button', { name: 'Mettre à la corbeille', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Contenu de la note', exact: true })
  ).toHaveCount(4)
  await page.reload()
  await waitForHydration(page)
  await expect(
    page.getByRole('textbox', { name: 'Contenu de la note', exact: true })
  ).toHaveCount(4)
  await page.getByRole('button', { name: 'Corbeille', exact: true }).click()
  await expect(
    page
      .getByRole('dialog')
      .getByText('Copie de référence indépendante', { exact: true })
  ).toBeVisible()
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Fermer', exact: true })
    .click()
}
