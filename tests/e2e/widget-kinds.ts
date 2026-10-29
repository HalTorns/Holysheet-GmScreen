import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { ConvexHttpClient } from 'convex/browser'

import { api } from '../../convex/_generated/api'
import { readScreen } from '../helpers/gm-screen'
import { waitForHydration } from './helpers'

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
  await waitForHydration(page)
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
  await waitForHydration(page)
  // Après rechargement, un clic avant l'hydratation est perdu (AUD-08) :
  // on réessaie jusqu'à ce que la case réagisse réellement.
  const autosaveAfterReload = page.getByRole('checkbox', {
    name: 'Sauvegarde automatique',
    exact: true,
  })
  await expect(async () => {
    await autosaveAfterReload.uncheck({ timeout: 2000 })
    await expect(autosaveAfterReload).not.toBeChecked()
  }).toPass({ timeout: 20_000 })
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
  await waitForHydration(page)
  // Après rechargement, un clic avant l'hydratation est perdu (AUD-08) :
  // on réessaie jusqu'à ce que la case réagisse réellement.
  const autosave = page.getByRole('checkbox', {
    name: 'Sauvegarde automatique',
    exact: true,
  })
  await expect(async () => {
    await autosave.uncheck({ timeout: 2000 })
    await expect(autosave).not.toBeChecked()
  }).toPass({ timeout: 20_000 })
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
  await waitForHydration(other)
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
  await waitForHydration(other)
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
  // F1 runs before this scenario, in the same project. Keep earlier widget indices stable.
  await add('sheet')
  const sheetWidget = page.getByRole('region', {
    name: 'Widget fiche 6',
    exact: true,
  })
  await expect(sheetWidget).toContainText('Choisir une fiche')
  await sheetWidget
    .getByLabel('Rechercher une fiche', { exact: true })
    .fill('Aubergiste')
  await sheetWidget
    .getByRole('button', { name: 'Afficher « Aubergiste »', exact: true })
    .click()
  await sheetWidget
    .getByRole('button', { name: 'Enregistrer le widget', exact: true })
    .click()
  await expect(sheetWidget).toContainText('Sait tout sur tout le monde')
  const sheetUrl = await sheetWidget
    .getByRole('link', { name: 'Ouvrir la fiche', exact: true })
    .getAttribute('href')
  if (!sheetUrl) throw new Error('Missing linked sheet')
  await other.goto(sheetUrl)
  await waitForHydration(other)
  await other
    .getByLabel('Résumé', { exact: true })
    .fill('Connaît le passage secret')
  await other
    .getByRole('button', { name: 'Enregistrer la fiche', exact: true })
    .click()
  await expect(
    other.getByRole('button', { name: 'Enregistrer la fiche', exact: true })
  ).toBeDisabled()
  await expect(sheetWidget).toContainText('Connaît le passage secret')
  await page.getByRole('button', { name: 'Lecture seule', exact: true }).click()
  await expect(sheetWidget).toContainText('Connaît le passage secret')
  await expect(
    sheetWidget.getByRole('link', { name: 'Ouvrir la fiche', exact: true })
  ).toBeVisible()
  await page
    .getByRole('button', { name: 'Reprendre l’édition', exact: true })
    .click()
  await add('table')
  const table = page.getByRole('region', {
    name: 'Widget tableau 7',
    exact: true,
  })
  await table
    .getByLabel('Coller un tableau', { exact: true })
    .evaluate((element) => {
      const clipboard = new DataTransfer()
      clipboard.setData('text/plain', 'A\tB\tC\nD\tE\tF')
      element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: clipboard,
          bubbles: true,
          cancelable: true,
        })
      )
    })
  await expect(table).toContainText('2 lignes × 3 colonnes')
  await table
    .getByRole('button', { name: 'Confirmer le collage', exact: true })
    .click()
  await expect(table.getByLabel('Cellule 1, 3', { exact: true })).toHaveValue(
    'C'
  )
  await expect(
    table.getByRole('button', { name: 'Ajouter une ligne', exact: true })
  ).toBeEnabled()
  await table.getByLabel('Cellule 2, 3', { exact: true }).fill('Modifié')
  await table
    .getByRole('button', { name: 'Enregistrer le widget', exact: true })
    .click()
  await expect(
    table.getByRole('button', { name: 'Enregistrer le widget', exact: true })
  ).toBeDisabled()
  await page.reload()
  await waitForHydration(page)
  await expect(table.getByLabel('Cellule 2, 3', { exact: true })).toHaveValue(
    'Modifié'
  )
  await page
    .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
    .uncheck()
  await add('clock')
  const clock = page.getByRole('region', {
    name: 'Widget horloge 8',
    exact: true,
  })
  await clock
    .getByLabel('Mode de l’horloge', { exact: true })
    .selectOption('timer')
  await clock.getByLabel('Durée en secondes', { exact: true }).fill('30')
  await clock
    .getByRole('button', { name: 'Enregistrer le widget', exact: true })
    .click()
  await expect(
    clock.getByRole('button', { name: 'Démarrer', exact: true })
  ).toBeEnabled()
  await expect(
    clock.getByLabel('Temps de l’horloge', { exact: true })
  ).toHaveText('00:30')
  await clock.getByRole('button', { name: 'Démarrer', exact: true }).click()
  await expect(
    clock.getByLabel('Temps de l’horloge', { exact: true })
  ).not.toHaveText('00:30')
  await expect(
    clock.getByRole('button', { name: 'Pause', exact: true })
  ).toBeEnabled()
  await clock.getByRole('button', { name: 'Pause', exact: true }).click()
  await expect(
    clock.getByRole('button', { name: 'Démarrer', exact: true })
  ).toBeEnabled()
  const paused = await clock
    .getByLabel('Temps de l’horloge', { exact: true })
    .textContent()
  const seconds = (value: string | null) =>
    Number(value?.split(':')[0] ?? 0) * 60 + Number(value?.split(':')[1] ?? 0)
  await page.reload()
  await waitForHydration(page)
  await expect(
    clock.getByRole('button', { name: 'Démarrer', exact: true })
  ).toBeEnabled()
  const restored = await clock
    .getByLabel('Temps de l’horloge', { exact: true })
    .textContent()
  expect(Math.abs(seconds(paused) - seconds(restored))).toBeLessThanOrEqual(1)
  // Wait beyond a display tick and verify the paused value stays frozen.
  const frozenAt = Date.now()
  await expect
    .poll(async () => {
      const displayed = await clock
        .getByLabel('Temps de l’horloge', { exact: true })
        .textContent()
      return displayed === restored && Date.now() - frozenAt >= 1200
    })
    .toBe(true)
  await page
    .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
    .uncheck()
  await add('initiative')
  const initiative = page.getByRole('region', {
    name: 'Widget initiative 9',
    exact: true,
  })
  for (let index = 0; index < 3; index++)
    await initiative
      .getByRole('button', { name: 'Ajouter un participant', exact: true })
      .click()
  await initiative
    .getByRole('button', { name: 'Enregistrer le widget', exact: true })
    .click()
  await expect(
    initiative.getByRole('button', {
      name: 'Enregistrer le widget',
      exact: true,
    })
  ).toBeDisabled()
  await other.goto(page.url())
  await waitForHydration(other)
  const remote = other.getByRole('region', {
    name: 'Widget initiative 9',
    exact: true,
  })
  for (const participant of ['Participant 1', 'Participant 2']) {
    await expect(
      initiative.getByRole('button', { name: 'Tour suivant', exact: true })
    ).toBeEnabled()
    await initiative
      .getByRole('button', { name: 'Tour suivant', exact: true })
      .click()
    await expect(
      initiative.locator('[aria-current="true"] input').first()
    ).toHaveValue(participant)
    await expect(
      remote.locator('[aria-current="true"] input').first()
    ).toHaveValue(participant)
  }
  await expect(initiative.getByRole('status').first()).toHaveText('Round 1')
  await expect(remote.getByRole('status').first()).toHaveText('Round 1')
}
