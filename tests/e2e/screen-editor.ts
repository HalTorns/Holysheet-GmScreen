import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'
import type { ConvexHttpClient } from 'convex/browser'

import { api } from '../../convex/_generated/api'
import { readScreen } from '../helpers/gm-screen'
import { waitForHydration } from './helpers'

async function drag(page: Page, handle: Locator, dx: number, dy: number) {
  await expect(handle).toBeEnabled()
  await handle.scrollIntoViewIfNeeded()
  const box = await handle.boundingBox()
  if (!box) throw new Error('Missing visible widget handle')
  const point = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  await page.mouse.move(point.x, point.y)
  await page.mouse.down()
  await page.mouse.move(point.x + dx, point.y + dy, { steps: 5 })
  await page.mouse.up()
}

// This runs inside the real password-authenticated local journey. It owns
// pointer capture, zoom coordinates, reactive cross-window state and persisted
// restoration, which unit tests of geometry alone would not establish.
export async function verifyScreenEditor(
  page: Page,
  secondPage: Page,
  client: ConvexHttpClient
) {
  const id = new URL(page.url()).pathname.split('/').at(-1)
  if (!id) throw new Error('Missing Screen route')
  async function read() {
    const result = await readScreen(client, { id: id ?? '' })
    if (!result) throw new Error('Missing authenticated Screen')
    return result
  }
  const original = await read()
  const bureau = original.layouts.find((p) => p.kind === 'digital')
  const paper = original.layouts.find((p) => p.kind === 'print')
  const note = original.notes[0]
  const initial = bureau?.placements[0]
  if (!bureau || !paper || !note || !initial)
    throw new Error('Missing editor fixture')
  async function profile(profileId: string) {
    const result = (await read()).layouts.find((item) => item._id === profileId)
    if (!result) throw new Error('Missing profile')
    return result
  }
  const autoSave = page.getByRole('checkbox', {
    name: 'Sauvegarde automatique',
    exact: true,
  })
  await autoSave.check()
  await drag(
    page,
    page.getByRole('button', { name: 'Déplacer la note 1', exact: true }),
    80,
    40
  )
  await expect
    .poll(async () => (await profile(bureau._id)).placements[0]?.x)
    .toBe(initial.x + 80)
  await expect(
    secondPage.getByRole('spinbutton', { name: 'Position X', exact: true })
  ).toHaveValue(String(initial.x + 80))
  await page
    .getByRole('combobox', { name: 'Zoom du Screen' })
    .selectOption('50')
  await drag(
    page,
    page.getByRole('button', { name: 'Redimensionner la note 1', exact: true }),
    40,
    20
  )
  await expect
    .poll(async () => (await profile(bureau._id)).placements[0]?.width)
    .toBe(initial.width + 80)
  await expect
    .poll(async () => (await profile(bureau._id)).placements[0]?.height)
    .toBe(initial.height + 40)
  await page
    .getByRole('button', { name: 'Déplacer la note 1', exact: true })
    .press('ArrowRight')
  await expect
    .poll(async () => (await profile(bureau._id)).placements[0]?.x)
    .toBe(initial.x + 81)
  await page
    .getByRole('button', { name: 'Nouveau profil', exact: true })
    .click()
  await page
    .getByLabel('Nom du nouveau profil', { exact: true })
    .fill('Portable')
  await page
    .getByRole('button', { name: 'Créer le profil', exact: true })
    .click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  const portable = (await read()).layouts.find(
    (item) => item.name === 'Portable'
  )
  if (!portable) throw new Error('Missing new profile')
  await expect(
    page.getByRole('combobox', { name: 'Profil de disposition' })
  ).toHaveValue(portable._id)
  await page
    .getByRole('spinbutton', { name: 'Position X', exact: true })
    .fill('480')
  await expect
    .poll(async () => (await profile(portable._id)).placements[0]?.x)
    .toBe(480)
  expect((await profile(bureau._id)).placements[0]?.x).toBe(initial.x + 81)
  expect((await read()).layouts.find((item) => item._id === paper._id)).toEqual(
    paper
  )
  await page
    .getByRole('textbox', { name: 'Contenu de la note', exact: true })
    .fill('Texte commun aux profils')
  await expect
    .poll(async () => (await read()).notes[0]?.body)
    .toBe('Texte commun aux profils')
  await expect(
    secondPage.getByRole('textbox', { name: 'Contenu de la note', exact: true })
  ).toHaveValue('Texte commun aux profils')
  await page
    .getByRole('button', { name: 'Annuler la disposition', exact: true })
    .click()
  await expect
    .poll(async () => (await profile(portable._id)).placements[0]?.x)
    .toBe(initial.x + 81)
  await page
    .getByRole('button', { name: 'Refaire la disposition', exact: true })
    .click()
  await expect
    .poll(async () => (await profile(portable._id)).placements[0]?.x)
    .toBe(480)
  const revisions = await client.query(api.gmEditor.listHistory, {
    target: { kind: 'layout', id: portable._id },
    paginationOpts: { numItems: 5, cursor: null },
  })
  const prior = revisions.page[0]
  if (!prior) throw new Error('Missing persistent layout history')
  await page
    .getByRole('group', { name: 'Éditeur de disposition', exact: true })
    .getByRole('button', { name: 'Historique', exact: true })
    .first()
    .click()
  await page
    .getByRole('dialog')
    .getByRole('button', {
      name: `Restaurer la version ${prior.version}`,
      exact: true,
    })
    .click()
  await expect
    .poll(async () => (await profile(portable._id)).placements[0]?.x)
    .toBe(initial.x + 81)
  await page
    .getByRole('dialog')
    .getByRole('button', { name: 'Fermer', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Verrouiller la disposition', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Déplacer la note 1', exact: true })
  ).toBeDisabled()
  await expect(
    secondPage.getByRole('button', { name: 'Déplacer la note 1', exact: true })
  ).toBeDisabled()
  await page
    .getByRole('textbox', { name: 'Contenu de la note', exact: true })
    .fill('Contenu modifiable en mode verrouillé')
  await expect
    .poll(async () => (await read()).notes[0]?.body)
    .toBe('Contenu modifiable en mode verrouillé')
  await page.reload()
  await waitForHydration(page)
  await expect(
    page.getByRole('button', { name: 'Déplacer la note 1', exact: true })
  ).toBeDisabled()
  await page
    .getByRole('combobox', { name: 'Profil de disposition' })
    .selectOption(portable._id)
  await expect(
    page.getByRole('spinbutton', { name: 'Position X', exact: true })
  ).toHaveValue(String(initial.x + 81))
  await expect(
    page.getByRole('textbox', { name: 'Contenu de la note', exact: true })
  ).toHaveValue('Contenu modifiable en mode verrouillé')
  await page.getByRole('button', { name: 'Lecture seule', exact: true }).click()
  await expect(
    page.getByRole('textbox', { name: 'Contenu de la note', exact: true })
  ).not.toBeEditable()
  await page
    .getByRole('button', { name: 'Reprendre l’édition', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Déverrouiller la disposition', exact: true })
    .click()
  await page
    .getByRole('button', { name: 'Configurer le profil', exact: true })
    .click()
  await page.getByLabel('Largeur du profil (px)', { exact: true }).fill('640')
  await page.getByLabel('Hauteur du profil (px)', { exact: true }).fill('480')
  await page
    .getByRole('button', { name: 'Appliquer les dimensions', exact: true })
    .click()
  await expect.poll(async () => (await profile(portable._id)).width).toBe(640)
  expect((await profile(portable._id)).placements[0]?.x).toBe(initial.x + 81)
  expect((await read()).layouts.find((item) => item._id === paper._id)).toEqual(
    paper
  )
  await page.setViewportSize({ width: 390, height: 844 })
  await expect(
    page.getByRole('group', { name: 'Surface du Screen', exact: true })
  ).toHaveCSS('width', '640px')
  await page
    .getByRole('textbox', { name: 'Contenu de la note', exact: true })
    .fill('Note modifiée sur mobile')
  await expect
    .poll(async () => (await read()).notes[0]?.body)
    .toBe('Note modifiée sur mobile')
  await page.setViewportSize({ width: 1280, height: 720 })
  await page
    .getByRole('button', { name: 'Ajouter une note', exact: true })
    .click()
  await expect(
    page.getByRole('textbox', { name: 'Contenu de la note', exact: true })
  ).toHaveCount(2)
  const added = (await read()).notes.find((item) => item._id !== note._id)
  if (!added) throw new Error('Missing second widget')
  await page
    .getByRole('combobox', { name: 'Note sélectionnée' })
    .selectOption(added._id)
  await page.getByRole('button', { name: 'Arrière-plan', exact: true }).click()
  await expect
    .poll(
      async () =>
        (await profile(portable._id)).placements.find(
          (p) => p.widgetId === added._id
        )?.layer
    )
    .toBe(0)
  expect(
    (await profile(portable._id)).placements.find(
      (p) => p.widgetId === note._id
    )?.layer
  ).toBe(1)
}
