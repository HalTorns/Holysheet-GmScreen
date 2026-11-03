import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

// Parcours de l'éditeur de Screen : les actions passent par les menus ＋ et ⚙,
// le menu ⋯ de chaque widget et l'inspecteur. Les éléments gardent le libellé
// des anciens boutons ; seul le rôle change (menuitem, menuitemcheckbox).

async function follow(page: Page, path: string[]) {
  for (const name of path) {
    const menu = page.getByRole('menu').last()
    const item = menu
      .getByRole('menuitem', { name, exact: true })
      .or(menu.getByRole('menuitemradio', { name, exact: true }))
      .or(menu.getByRole('menuitemcheckbox', { name, exact: true }))
    try {
      await expect(item).toBeVisible()
    } catch (error) {
      // Diagnostic CI : état réel des menus quand un élément manque.
      console.log(
        `[menu] ${name}: ${await page.getByRole('menu').count()} menu(s)\n`,
        (await page.locator('body').ariaSnapshot()).slice(0, 6000)
      )
      throw error
    }
    await item.click()
  }
}

/** Ouvre un menu par son déclencheur puis suit le chemin d'éléments. */
async function menuAction(page: Page, trigger: Locator, ...path: string[]) {
  await trigger.click()
  await follow(page, path)
}

function screenSettings(page: Page) {
  return page.getByRole('button', { name: 'Réglages du Screen', exact: true })
}

export async function screenMenu(page: Page, ...path: string[]) {
  await menuAction(page, screenSettings(page), ...path)
}

export async function addMenu(page: Page, ...path: string[]) {
  await menuAction(
    page,
    page.getByRole('button', { name: 'Ajouter', exact: true }),
    ...path
  )
}

/** Coche ou décoche une case du menu ⚙ (verrou, sauvegarde automatique…). */
export async function setScreenOption(
  page: Page,
  name: string,
  checked: boolean
) {
  await screenSettings(page).click()
  const item = page.getByRole('menuitemcheckbox', { name, exact: true })
  await expect(item).toBeVisible()
  if ((await item.getAttribute('aria-checked')) !== String(checked))
    await item.click()
  await expect(item).toHaveAttribute('aria-checked', String(checked))
  await page.keyboard.press('Escape')
  await expect(page.getByRole('menu')).toHaveCount(0)
}

export async function setMode(page: Page, mode: 'Édition' | 'Jeu' | 'Lecture') {
  await page
    .getByRole('radiogroup', { name: 'Mode du Screen', exact: true })
    .getByRole('radio', { name: mode, exact: true })
    .click()
}

export async function selectProfile(page: Page, name: string) {
  await screenMenu(page, 'Profil de disposition', name)
  await expect(page.getByText(`· ${name}`, { exact: false })).toBeVisible()
}

function inspector(page: Page) {
  return page.getByRole('dialog', { name: 'Inspecteur', exact: true })
}

/** Ouvre l'inspecteur du widget n (à partir de 1) sur l'onglet voulu. */
export async function inspect(
  page: Page,
  index: number,
  tab: 'Contenu' | 'Style' | 'Position' = 'Contenu'
) {
  await page
    .getByRole('button', { name: `Configurer le widget ${index}`, exact: true })
    .click()
  const panel = inspector(page)
  await expect(panel).toBeVisible()
  if (tab !== 'Contenu')
    await panel.getByRole('tab', { name: tab, exact: true }).click()
  return panel
}

export async function closeInspector(page: Page) {
  await page
    .getByRole('button', { name: 'Fermer inspecteur', exact: true })
    .click()
  await expect(inspector(page)).toHaveCount(0)
}

/** Menu ⋯ du widget n. */
export async function widgetAction(
  page: Page,
  index: number,
  ...path: string[]
) {
  await menuAction(
    page,
    page.getByRole('button', {
      name: `Actions du widget ${index}`,
      exact: true,
    }),
    ...path
  )
}

/** Ajoute le widget n à la sélection multiple (Maj + clic sur sa poignée). */
async function addToSelection(page: Page, index: number) {
  await page
    .getByRole('button', { name: `Déplacer la note ${index}`, exact: true })
    .click({ modifiers: ['Shift'] })
}

export function selectionBar(page: Page) {
  return page.getByRole('toolbar', {
    name: 'Sélection de widgets',
    exact: true,
  })
}

/** Sélectionne exactement les widgets donnés (à partir de 1). */
export async function selectWidgets(page: Page, ...indices: number[]) {
  const [first, ...others] = indices
  if (first === undefined) return
  const handle = page.getByRole('button', {
    name: `Déplacer la note ${first}`,
    exact: true,
  })
  await handle.click()
  await page.keyboard.press('Escape')
  await handle.click()
  for (const index of others) await addToSelection(page, index)
  if (others.length)
    await expect(
      selectionBar(page).getByText(`${indices.length} sélectionnés`)
    ).toBeVisible()
}

/**
 * Sauvegarde automatique de la vue. Juste après un chargement, un clic avant
 * l'hydratation est perdu (AUD-08) : on réessaie jusqu'à ce qu'il prenne.
 */
export async function setAutoSave(page: Page, enabled: boolean) {
  await expect(async () => {
    await setScreenOption(page, 'Sauvegarde automatique', enabled)
  }).toPass({ timeout: 20_000 })
}
