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
    // exact : le libellé « Type » englobe la liste, dont l'option « Formule ».
    await form
      .getByLabel(type === 'formula' ? 'Formule' : 'Valeur', { exact: true })
      .fill(input)
    await form.getByRole('button', { name: 'Créer la variable' }).click()
  }
  await create('force', 'number', '')
  await expect(form.getByRole('alert')).toHaveText('Saisissez un nombre fini.')
  await expect(form.getByLabel('Valeur', { exact: true })).toHaveValue('')
  await expect(page.getByLabel('Résultat de force')).toHaveCount(0)
  await create('force', 'number', '3')
  await expect(page.getByLabel('Résultat de force')).toHaveText('3')
  await create('bonus', 'formula', 'force * 2 + 1')
  await expect(page.getByLabel('Résultat de bonus')).toHaveText('7')
  await page.getByLabel('Valeur de force').fill('')
  await page.getByRole('button', { name: 'Enregistrer force' }).click()
  const forceRow = page
    .getByRole('row')
    .filter({ has: page.getByLabel('Valeur de force', { exact: true }) })
  await expect(forceRow.getByRole('alert')).toHaveText(
    'Saisissez un nombre fini.'
  )
  await expect(page.getByLabel('Valeur de force')).toHaveValue('')
  await expect(page.getByLabel('Résultat de force')).toHaveText('3')
  await page.getByLabel('Valeur de force').fill('5')
  await page.getByRole('button', { name: 'Enregistrer force' }).click()
  await expect(page.getByLabel('Résultat de bonus')).toHaveText('11')
  await page.getByLabel('Libellé de force').fill('Force physique')
  await page.getByRole('button', { name: 'Enregistrer force' }).click()
  await expect
    .poll(async () => {
      const rows = await client.query(api.gmVariables.listVariables, {
        projectId,
      })
      return rows.find((row) => row.variable.name === 'force')?.variable.label
    })
    .toBe('Force physique')
  await page.reload()
  await expect(page.getByLabel('Libellé de force')).toHaveValue(
    'Force physique'
  )

  // Deux vues du même compte : la mise à jour distante conserve le brouillon
  // et sa version d'origine, puis la sauvegarde obsolète expose le conflit.
  const other = await page.context().newPage()
  try {
    await other.goto(page.url())
    await expect(other.getByLabel('Valeur de bonus')).toHaveValue(
      'force * 2 + 1'
    )
    await page.getByLabel('Valeur de bonus').fill('force * 3')
    await other.getByLabel('Valeur de bonus').fill('force * 4')
    await other.getByRole('button', { name: 'Enregistrer bonus' }).click()
    await expect(page.getByLabel('Résultat de bonus')).toHaveText('20')
    await expect(page.getByLabel('Valeur de bonus')).toHaveValue('force * 3')
    await page.getByRole('button', { name: 'Enregistrer bonus' }).click()
    const bonusRow = page
      .getByRole('row')
      .filter({ has: page.getByLabel('Valeur de bonus', { exact: true }) })
    await expect(bonusRow.getByRole('alert')).toBeVisible()
    await expect(page.getByLabel('Valeur de bonus')).toHaveValue('force * 3')
    await bonusRow
      .getByRole('button', { name: 'Charger la version enregistrée' })
      .click()
    await expect(page.getByLabel('Valeur de bonus')).toHaveValue('force * 4')
    await other.getByLabel('Valeur de bonus').fill('force * 5')
    await other.getByRole('button', { name: 'Enregistrer bonus' }).click()
    await expect(page.getByLabel('Valeur de bonus')).toHaveValue('force * 5')
  } finally {
    await other.close()
  }
  await create('boucle', 'formula', 'boucle + 1')
  await expect(form.getByRole('alert')).toContainText('circulaire')
}
