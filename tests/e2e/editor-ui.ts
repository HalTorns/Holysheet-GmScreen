import { expect } from '@playwright/test'
import type { Locator, Page } from '@playwright/test'

// Parcours de l'éditeur de Screen : les actions passent par les menus ＋ et ⚙,
// le menu ⋯ de chaque widget et l'inspecteur. Les éléments gardent le libellé
// des anciens boutons ; seul le rôle change (menuitem, menuitemcheckbox).

// Diagnostic CI : durée des étapes lentes de l'interface.
function timing(label: string, started: number) {
  const elapsed = Date.now() - started
  if (elapsed > 2000) console.log(`[ui] ${label} ${elapsed} ms`)
}

async function follow(page: Page, path: string[]) {
  const started = Date.now()
  try {
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
  } finally {
    timing('follow', started)
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
  const started = Date.now()
  try {
    await menuAction(page, screenSettings(page), ...path)
  } finally {
    timing('screenMenu', started)
  }
}

export async function addMenu(page: Page, ...path: string[]) {
  const started = Date.now()
  try {
    await menuAction(
      page,
      page.getByRole('button', { name: 'Ajouter', exact: true }),
      ...path
    )
  } finally {
    timing('addMenu', started)
  }
}

/** Coche ou décoche une case du menu ⚙ (verrou, sauvegarde automatique…). */
export async function setScreenOption(
  page: Page,
  name: string,
  checked: boolean
) {
  const started = Date.now()
  try {
    await screenSettings(page).click()
    const item = page.getByRole('menuitemcheckbox', { name, exact: true })
    await expect(item).toBeVisible()
    if ((await item.getAttribute('aria-checked')) !== String(checked))
      await item.click()
    await expect(item).toHaveAttribute('aria-checked', String(checked))
    await page.keyboard.press('Escape')
    await expect(page.getByRole('menu')).toHaveCount(0)
  } finally {
    timing('setScreenOption', started)
  }
}

export async function setMode(page: Page, mode: 'Édition' | 'Jeu' | 'Lecture') {
  const started = Date.now()
  try {
    await page
      .getByRole('radiogroup', { name: 'Mode du Screen', exact: true })
      .getByRole('radio', { name: mode, exact: true })
      .click()
  } finally {
    timing('setMode', started)
  }
}

export async function selectProfile(page: Page, name: string) {
  const started = Date.now()
  try {
    await screenMenu(page, 'Profil de disposition', name)
    await expect(page.getByText(`· ${name}`, { exact: false })).toBeVisible()
  } finally {
    timing('selectProfile', started)
  }
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
  const started = Date.now()
  try {
    await page
      .getByRole('button', {
        name: `Configurer le widget ${index}`,
        exact: true,
      })
      .click()
    const panel = inspector(page)
    await expect(panel).toBeVisible()
    if (tab !== 'Contenu')
      await panel.getByRole('tab', { name: tab, exact: true }).click()
    return panel
  } finally {
    timing('inspect', started)
  }
}

export async function closeInspector(page: Page) {
  const started = Date.now()
  try {
    await page
      .getByRole('button', { name: 'Fermer inspecteur', exact: true })
      .click()
    await expect(inspector(page)).toHaveCount(0)
  } finally {
    timing('closeInspector', started)
  }
}

/**
 * Menu ⋯ du widget n, ouvert au clavier (Maj+F10 sur sa poignée) : fiable
 * même quand des copies superposées recouvrent son bouton ⋯.
 */
export async function widgetAction(
  page: Page,
  index: number,
  ...path: string[]
) {
  const started = Date.now()
  try {
    await page
      .getByRole('button', { name: `Déplacer la note ${index}`, exact: true })
      .press('Shift+F10')
    await expect(
      page.getByRole('menu', { name: `Actions du widget ${index}` })
    ).toBeVisible()
    await follow(page, path)
  } finally {
    timing('widgetAction', started)
  }
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
  const started = Date.now()
  try {
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
  } finally {
    timing('selectWidgets', started)
  }
}

/**
 * Sauvegarde automatique de la vue. Juste après un chargement, un clic avant
 * l'hydratation est perdu (AUD-08) : on réessaie jusqu'à ce qu'il prenne.
 */
export async function setAutoSave(page: Page, enabled: boolean) {
  const started = Date.now()
  try {
    await expect(async () => {
      await setScreenOption(page, 'Sauvegarde automatique', enabled)
    }).toPass({ timeout: 20_000 })
  } finally {
    timing('setAutoSave', started)
  }
}
