import { expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { ConvexHttpClient } from 'convex/browser'

import { api } from '../../convex/_generated/api'

// Variables et formules (F2) : création, recalcul en direct, refus de cycle.
export async function verifyVariables(page: Page, client: ConvexHttpClient) {
  const screenId = new URL(page.url()).pathname.split('/').at(-1) ?? ''
  const sheet = await client.query(api.gmSheets.getSheet, { id: screenId })
  const projectId = sheet?.sheet.projectId
  if (!projectId) throw new Error('Missing project')
  await page.goto(`/app/projects/${projectId}/variables`)
  await expect(
    page.getByRole('heading', { name: 'Variables du projet' })
  ).toBeVisible()
  const form = page.getByRole('form', { name: 'Nouvelle variable' })
  async function create(name: string, type: string, input: string) {
    await form.getByLabel('Nom de la variable').fill(name)
    await form.getByLabel('Type').selectOption(type)
    await form.getByLabel(type === 'formula' ? 'Formule' : 'Valeur').fill(input)
    await form.getByRole('button', { name: 'Créer la variable' }).click()
  }
  await create('force', 'number', '3')
  await expect(page.getByLabel('Résultat de force')).toHaveText('3')
  await create('bonus', 'formula', 'force * 2 + 1')
  await expect(page.getByLabel('Résultat de bonus')).toHaveText('7')
  await page.getByLabel('Valeur de force').fill('5')
  await page.getByRole('button', { name: 'Enregistrer force' }).click()
  await expect(page.getByLabel('Résultat de bonus')).toHaveText('11')
  await create('boucle', 'formula', 'boucle + 1')
  await expect(form.getByRole('alert')).toContainText('circulaire')
}
