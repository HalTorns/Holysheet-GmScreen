import { expect, test } from '@playwright/test'

import { api } from '../../convex/_generated/api'
import {
  createEmail,
  deleteAccountWithClient,
  getAuthenticatedClient,
  signInWithEmail,
  waitForHydration,
} from './helpers'

test('F7 : catalogue partagé, ventes depuis deux onglets et purge de l’objet', async ({
  page,
}) => {
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  const other = await page.context().newPage()
  try {
    const projectId = await client.mutation(api.gm.createProject, {
      title: 'Marchands F7',
    })
    const create = (title: string, kind: 'merchant' | 'item') =>
      client.mutation(api.gmSheets.createSheet, { projectId, title, kind })
    const merchantId = await create('Alchimiste F7', 'merchant')
    const second = await create('Épicier F7', 'merchant')
    const itemId = await create('Potion F7', 'item')
    await page.goto(`/app/sheets/${itemId}`)
    await waitForHydration(page)
    const profile = page.getByRole('region', { name: 'Profil objet' })
    await profile.getByLabel('Prix de référence').fill('10')
    await profile.getByLabel('Devise', { exact: true }).fill('po')
    await profile.getByLabel('Catégorie', { exact: true }).fill('Potion')
    await profile
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click()
    await expect(profile.getByRole('status')).toHaveText('Enregistré')
    for (const id of [merchantId, second]) {
      await page.goto(`/app/sheets/${id}`)
      await waitForHydration(page)
      await page
        .getByLabel('Rechercher un objet', { exact: true })
        .fill('Potion F7')
      await page
        .getByRole('button', { name: 'Ajouter Potion F7', exact: true })
        .click()
      const stock = page.getByRole('table', { name: 'Objets en stock' })
      await expect(
        stock.getByText('Prix effectif : 10 po', { exact: true })
      ).toBeVisible()
      await stock.getByLabel('Quantité', { exact: true }).fill('5')
      await stock
        .getByRole('button', { name: 'Enregistrer', exact: true })
        .click()
      await expect(stock.getByRole('status')).toHaveText('Enregistré')
    }
    const screenId = await client.mutation(api.gm.createScreen, {
      projectId,
      title: 'Ventes F7',
      format: 'digital',
    })
    await client.mutation(api.gmWidgets.addWidget, {
      screenId,
      kind: 'sheet',
      sheetId: merchantId,
    })
    for (const tab of [page, other]) {
      await tab.goto(`/app/screens/${screenId}`)
      await waitForHydration(tab)
      await expect(
        tab.getByLabel('Stock Potion F7', { exact: true })
      ).toHaveText('5')
    }
    const sell = (tab: typeof page) =>
      tab.getByRole('button', { name: 'Vendre Potion F7', exact: true })
    await Promise.all([sell(page).press('Enter'), sell(other).press('Enter')])
    for (const tab of [page, other])
      await expect(
        tab.getByLabel('Stock Potion F7', { exact: true })
      ).toHaveText('3')
    expect(
      (await client.query(api.merchants.getStock, { merchantId: second }))[0]
        ?.quantity
    ).toBe(5)

    // A dirty absolute edit must survive a live sale from the other tab.
    await page.goto(`/app/sheets/${merchantId}`)
    await waitForHydration(page)
    const table = page.getByRole('table', { name: 'Objets en stock' })
    await table.getByLabel('Quantité', { exact: true }).fill('9')
    await expect(sell(other)).toBeEnabled()
    await sell(other).press('Enter')
    await expect(table.getByRole('alert')).toContainText(
      'brouillon est conservé'
    )
    await expect(table.getByLabel('Quantité', { exact: true })).toHaveValue('9')
    await table
      .getByRole('button', { name: 'Charger la version enregistrée' })
      .click()
    await expect(table.getByLabel('Quantité', { exact: true })).toHaveValue('2')
    await page.goto(`/app/sheets/${itemId}`)
    await waitForHydration(page)
    await profile.getByLabel('Prix de référence').fill('12.5')
    await profile
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click()
    await expect(profile.getByRole('status')).toHaveText('Enregistré')
    await expect(
      other.getByText('Potion F7 · 12.5 po ·', { exact: false })
    ).toBeVisible()
    for (const id of [merchantId, second]) {
      await page.goto(`/app/sheets/${id}`)
      await waitForHydration(page)
      await expect(
        page.getByText('Prix effectif : 12.5 po', { exact: true })
      ).toBeVisible()
    }
    await client.mutation(api.gmSheets.trashSheet, { id: itemId })
    await expect(
      other.getByText('Objet indisponible (en corbeille)', { exact: true })
    ).toBeVisible()
    await client.mutation(api.gmSheets.deleteSheetForever, { id: itemId })
    await expect(
      other.getByLabel('Stock Potion F7', { exact: true })
    ).toHaveCount(0)
    for (const id of [merchantId, second])
      expect(
        await client.query(api.merchants.getStock, { merchantId: id })
      ).toEqual([])
  } finally {
    await other.close()
    await deleteAccountWithClient(client)
  }
})
