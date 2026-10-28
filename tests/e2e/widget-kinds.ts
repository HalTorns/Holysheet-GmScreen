import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { ConvexHttpClient } from 'convex/browser'

import { api } from '../../convex/_generated/api'
import { readScreen } from '../helpers/gm-screen'

export async function verifyWidgetKinds(
  page: Page,
  other: Page,
  client: ConvexHttpClient
) {
  const screenUrl = page.url()
  const id = new URL(screenUrl).pathname.split('/').at(-1) ?? ''
  const data = await readScreen(client, { id })
  if (!data) throw new Error('Missing screen')
  const { projectId } = data.screen
  // Dedicated screen avoids changing the established F1/F3a note tool fixtures.
  const screenId = await client.mutation(api.gm.createScreen, {
    projectId,
    title: 'Widgets typés',
    format: 'digital',
  })
  await page.goto(`/app/screens/${screenId}`)
  await page
    .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
    .uncheck()
  async function add(kind: string) {
    await page.getByLabel('Type de widget', { exact: true }).selectOption(kind)
    await page
      .getByRole('button', { name: 'Ajouter un widget', exact: true })
      .click()
  }
  await add('checklist')
  const checklist = page.getByRole('region', {
    name: 'Widget checklist 1',
    exact: true,
  })
  await checklist
    .getByRole('button', { name: 'Ajouter un élément', exact: true })
    .click()
  await checklist
    .getByRole('button', { name: 'Ajouter un élément', exact: true })
    .click()
  await checklist
    .getByRole('button', { name: 'Enregistrer le widget', exact: true })
    .click()
  await expect(
    checklist.getByRole('button', {
      name: 'Enregistrer le widget',
      exact: true,
    })
  ).toBeDisabled()
  await checklist
    .getByRole('checkbox', { name: 'Élément 1', exact: true })
    .check()
  await expect(
    checklist.getByRole('button', { name: 'Monter Élément 2', exact: true })
  ).toBeEnabled()
  await checklist
    .getByRole('button', { name: 'Monter Élément 2', exact: true })
    .click()
  await checklist
    .getByRole('button', { name: 'Enregistrer le widget', exact: true })
    .click()
  await expect(
    checklist.getByRole('button', {
      name: 'Enregistrer le widget',
      exact: true,
    })
  ).toBeDisabled()
  await expect
    .poll(async () => {
      const widgets = await client.query(api.gmWidgets.listScreenWidgets, {
        screenId,
        paginationOpts: { numItems: 10, cursor: null },
      })
      const saved = widgets.page.find((entry) => entry.kind === 'checklist')
      return (
        saved?.kind === 'checklist' &&
        saved.config.items[0]?.id === 'item-2' &&
        saved.state.checkedIds.includes('item-1')
      )
    })
    .toBe(true)
  await page.reload()
  await page
    .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
    .uncheck()
  await expect(
    checklist.getByRole('checkbox', { name: 'Élément 1', exact: true })
  ).toBeChecked()
  await expect(
    checklist.getByRole('textbox', { name: 'Libellé 1', exact: true })
  ).toHaveValue('Élément 2')
  await add('counter')
  await add('dice')
  const dice = page.getByRole('region', { name: 'Widget dice 3', exact: true })
  await dice.getByLabel('Expression de dés', { exact: true }).fill('2d6+1')
  await dice
    .getByRole('button', { name: 'Enregistrer le widget', exact: true })
    .click()
  await expect(
    dice.getByRole('button', { name: 'Lancer', exact: true })
  ).toBeEnabled()
  await dice.getByRole('button', { name: 'Lancer', exact: true }).click()
  const result = dice.locator('[aria-live="polite"]')
  await expect(result).toContainText('Total :')
  const values =
    ((await result.textContent()) ?? '').match(/\d+/g)?.map(Number) ?? []
  expect(values).toHaveLength(3)
  const [first = 0, second = 0, total = 0] = values
  expect(first).toBeGreaterThanOrEqual(1)
  expect(first).toBeLessThanOrEqual(6)
  expect(second).toBeGreaterThanOrEqual(1)
  expect(second).toBeLessThanOrEqual(6)
  expect(total).toBe(first + second + 1)
  await page.reload()
  await page
    .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
    .uncheck()
  await expect(
    dice.getByLabel('Expression de dés', { exact: true })
  ).toHaveValue('2d6+1')
  await expect(result).toBeEmpty()

  const counter = page.getByRole('region', {
    name: 'Widget counter 2',
    exact: true,
  })
  const variables = await client.query(api.gmVariables.listVariables, {
    projectId,
  })
  const force = variables.find(
    (entry) => entry.variable.name === 'force'
  )?.variable
  if (!force || force.type !== 'number')
    throw new Error('Missing number variable')
  await counter
    .getByLabel('Variable nombre', { exact: true })
    .selectOption(force._id)
  page.once('dialog', (dialog) => dialog.accept())
  await counter
    .getByRole('button', { name: 'Lier la variable', exact: true })
    .click()
  await counter
    .getByRole('button', { name: 'Enregistrer le widget', exact: true })
    .click()
  await expect(
    counter.getByRole('button', { name: 'Augmenter', exact: true })
  ).toBeEnabled()
  await other.goto(page.url())
  await counter.getByRole('button', { name: 'Augmenter', exact: true }).click()
  await expect(
    counter.getByLabel('Valeur du compteur', { exact: true }).first()
  ).toHaveText(String(force.value + 1))
  await expect(
    other
      .getByRole('region', { name: 'Widget counter 2', exact: true })
      .getByLabel('Valeur du compteur', { exact: true })
      .first()
  ).toHaveText(String(force.value + 1))
  await other.goto(`/app/projects/${projectId}/variables`)
  await expect(
    other.getByLabel('Résultat de force', { exact: true })
  ).toHaveText(String(force.value + 1))
  await page
    .getByRole('button', { name: 'Verrouiller la disposition', exact: true })
    .click()
  await expect(
    dice.getByLabel('Expression de dés', { exact: true })
  ).toBeDisabled()
  await expect(
    counter.getByRole('button', { name: 'Augmenter', exact: true })
  ).toBeEnabled()
  await expect(
    checklist.getByRole('checkbox', { name: 'Élément 1', exact: true })
  ).toBeEnabled()
  await page.getByRole('button', { name: 'Lecture seule', exact: true }).click()
  await expect(
    dice.getByRole('button', { name: 'Lancer', exact: true })
  ).toHaveCount(0)
  await page
    .getByRole('button', { name: 'Reprendre l’édition', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Déverrouiller la disposition', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Ajouter une note', exact: true })
    .click()
  await page
    .getByRole('textbox', { name: 'Contenu de la note', exact: true })
    .fill('Note pour restauration F3b')
  await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
  await expect(
    page.getByRole('button', { name: 'Enregistrer', exact: true })
  ).toBeDisabled()
  await page
    .getByRole('combobox', { name: 'Note sélectionnée', exact: true })
    .selectOption({ label: 'Note 1' })
  await page.getByRole('button', { name: 'Dupliquer', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Widget checklist 5', exact: true })
  ).toBeVisible()
  await page
    .getByRole('combobox', { name: 'Note sélectionnée', exact: true })
    .selectOption({ label: 'Note 5' })
  await page
    .getByRole('button', { name: 'Mettre à la corbeille', exact: true })
    .click()
  await page.getByRole('button', { name: 'Corbeille', exact: true }).click()
  const trash = page.getByRole('dialog')
  await trash
    .getByRole('button', { name: 'Restaurer cette note', exact: true })
    .click()
  await trash.getByRole('button', { name: 'Fermer', exact: true }).click()
  await expect(
    page.getByRole('region', { name: 'Widget checklist 5', exact: true })
  ).toBeVisible()
  await page
    .getByText('Sélection, groupes et alignement', { exact: true })
    .click()
  await page
    .getByRole('checkbox', { name: 'Sélectionner la note 1', exact: true })
    .check()
  await page
    .getByRole('checkbox', { name: 'Sélectionner la note 4', exact: true })
    .check()
  await page.getByRole('button', { name: 'Grouper', exact: true }).click()
  await page
    .getByRole('button', { name: 'Enregistrer la disposition', exact: true })
    .click()
  await expect
    .poll(async () => {
      const screen = await readScreen(client, { id: screenId })
      const layout = screen?.layouts.find((entry) => entry.kind === 'digital')
      const firstWidget = screen?.notes[0]
      const note = screen?.notes.find((entry) => entry.kind === 'note')
      const group = layout?.placements.find(
        (entry) => entry.widgetId === firstWidget?._id
      )?.groupId
      return Boolean(
        group &&
        layout?.placements.find((entry) => entry.widgetId === note?._id)
          ?.groupId === group
      )
    })
    .toBe(true)
}
