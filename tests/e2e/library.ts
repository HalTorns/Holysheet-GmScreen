import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { ConvexHttpClient } from 'convex/browser'

import { api } from '../../convex/_generated/api'
import { readScreen } from '../helpers/gm-screen'

// Bibliothèque de fiches (F1) : création, édition, lien et rétrolien par
// l'interface, vérifiés aussi côté serveur.
export async function verifyLibrary(page: Page, client: ConvexHttpClient) {
  const screenId = new URL(page.url()).pathname.split('/').at(-1) ?? ''
  const screen = await readScreen(client, { id: screenId })
  if (!screen) throw new Error('Missing Screen')
  const projectId = screen.screen.projectId
  await page.goto(`/app/projects/${projectId}/library`)
  await expect(
    page.getByRole('heading', { name: 'Fiches du projet' })
  ).toBeVisible()

  async function create(kind: string, title: string) {
    await page.getByLabel('Type de la nouvelle fiche').selectOption(kind)
    await page
      .getByRole('textbox', { name: 'Créer une fiche', exact: true })
      .fill(title)
    await page
      .getByRole('button', { name: 'Créer une fiche', exact: true })
      .click()
    await expect(
      page.getByRole('link', { name: new RegExp(title) })
    ).toBeVisible()
  }
  await create('place', 'Taverne du Pendu')
  await create('npc', 'Aubergiste')

  await page.getByRole('link', { name: /Aubergiste/ }).click()
  await expect(page.getByRole('heading', { name: 'Aubergiste' })).toBeVisible()
  await page.getByLabel('Résumé').fill('Sait tout sur tout le monde')
  await page
    .getByRole('button', { name: 'Ajouter un champ', exact: true })
    .click()
  await page.getByLabel('Valeur du champ 1').fill('Port-Sel')
  await page
    .getByRole('button', { name: 'Enregistrer la fiche', exact: true })
    .click()
  await expect(
    page.getByRole('button', { name: 'Enregistrer la fiche', exact: true })
  ).toBeDisabled()
  const sheetId = new URL(page.url()).pathname.split('/').at(-1) ?? ''
  await expect
    .poll(async () => {
      const saved = await client.query(api.gmSheets.getSheet, { id: sheetId })
      return saved && [saved.sheet.summary, saved.fields[0]?.value]
    })
    .toEqual(['Sait tout sur tout le monde', 'Port-Sel'])

  await page.getByLabel('Relier une fiche').fill('Taverne')
  await page
    .getByRole('button', { name: 'Relier « Taverne du Pendu »', exact: true })
    .click()
  const tavern = page.getByRole('link', {
    name: 'Lieu · Taverne du Pendu',
    exact: true,
  })
  await expect(tavern).toBeVisible()
  await tavern.click()
  await expect(
    page.getByRole('heading', { name: 'Taverne du Pendu' })
  ).toBeVisible()
  await expect(
    page
      .getByRole('region', { name: 'Rétroliens' })
      .getByRole('link', { name: 'PNJ · Aubergiste', exact: true })
  ).toBeVisible()
}
