import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { api } from '../../convex/_generated/api'
import { readScreen } from '../helpers/gm-screen'
import {
  addMenu,
  createFrom,
  inspect,
  projectResource,
  screenMenu,
  setMode,
  widgetAction,
} from './editor-ui'
import {
  createEmail,
  deleteAccountWithClient,
  getAuthenticatedClient,
  signInWithEmail,
  waitForHydration,
} from './helpers'

// Contrôles interactifs visibles hors de la surface du Screen et hors du menu
// de navigation de l'application.
function visibleControls(page: Page) {
  return page.locator('main').evaluate((main) => {
    const surface = main.querySelector('[aria-label="Surface du Screen"]')
    return [
      ...main.querySelectorAll<HTMLElement>(
        'button, select, input, textarea, a[href], [role="radio"]'
      ),
    ].filter((element) => {
      if (surface?.contains(element) || element.closest('[role="radiogroup"]'))
        return false
      const box = element.getBoundingClientRect()
      return box.width > 0 && box.height > 0
    }).length
  })
}

test('3a: dense controls live in menus, modes separate play from reading, mobile stays usable', async ({
  page,
}) => {
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  try {
    const projectId = await client.mutation(api.gm.createProject, {
      title: 'Ergonomie 3a',
    })
    const screenId = await client.mutation(api.gm.createScreen, {
      projectId,
      title: 'Menus 3a',
      format: 'digital',
    })
    await page.goto(`/app/screens/${screenId}`)
    await waitForHydration(page)
    await addMenu(page, 'Outils de partie', 'Dés')
    await addMenu(page, 'Texte et listes', 'Checklist')
    await expect(
      page.getByRole('region', { name: 'Widget checklist 2', exact: true })
    ).toBeVisible()

    // Densité : retour, ＋, Annuler, Refaire, ⚙ et zoom (le mode compte pour un).
    expect(await visibleControls(page)).toBeLessThanOrEqual(7)
    await setMode(page, 'Jeu')
    expect(await visibleControls(page)).toBeLessThanOrEqual(3)
    await expect(
      page.getByRole('button', { name: 'Déplacer la note 1', exact: true })
    ).toHaveCount(0)
    await page.getByRole('button', { name: 'Lancer', exact: true }).click()
    await expect(page.getByText(/Total :/)).toBeVisible()

    // Lecture : aucune mutation n'est émise.
    await setMode(page, 'Lecture')
    const writes: string[] = []
    page.on('websocket', (socket) =>
      socket.on('framesent', (frame) => {
        if (String(frame.payload).includes('"Mutation"'))
          writes.push(String(frame.payload))
      })
    )
    await expect(page.getByRole('checkbox')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Lancer' })).toHaveCount(0)
    await page.keyboard.press('Delete')
    expect(writes).toEqual([])
    await setMode(page, 'Édition')

    // Un widget hors cadre se retrouve par ⚙ › Aller au widget….
    const screen = await readScreen(client, { id: screenId })
    const layout = screen?.layouts.find((entry) => entry.kind === 'digital')
    if (!layout) throw new Error('Missing layout')
    await client.mutation(api.gmEditor.updateLayout, {
      id: layout._id,
      expectedVersion: layout.version,
      name: layout.name,
      width: layout.width,
      height: layout.height,
      placements: layout.placements.map((p, index) =>
        index === 0 ? { ...p, x: layout.width + 400 } : p
      ),
    })
    await screenMenu(page, 'Aller au widget…')
    await page
      .getByRole('dialog', { name: 'Aller au widget' })
      .getByRole('button', { name: /Dés 1.*hors cadre/ })
      .click()
    const position = page
      .getByRole('dialog', { name: 'Inspecteur', exact: true })
      .getByRole('spinbutton', { name: 'Position X', exact: true })
    await position.fill('40')
    await expect
      .poll(async () => {
        const data = await readScreen(client, { id: screenId })
        return data?.layouts.find((entry) => entry._id === layout._id)
          ?.placements[0]?.x
      })
      .toBe(40)

    // Raccourci clavier : Suppr met le widget sélectionné à la corbeille.
    await page
      .getByRole('button', { name: 'Déplacer la note 2', exact: true })
      .click()
    await page.keyboard.press('Delete')
    await expect(
      page.getByRole('region', { name: 'Widget checklist 2', exact: true })
    ).toHaveCount(0)
    await screenMenu(page, 'Corbeille du Screen…')
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Restaurer cette note', exact: true })
      .click()
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Fermer', exact: true })
      .click()
    await expect(
      page.getByRole('region', { name: 'Widget checklist 2', exact: true })
    ).toBeVisible()

    // Menu contextuel au clavier.
    await page
      .getByRole('button', { name: 'Déplacer la note 1', exact: true })
      .press('Shift+F10')
    await expect(page.getByRole('menuitem', { name: 'Dupliquer', exact: true }))
      .toBeVisible()
      .catch(async (error: unknown) => {
        console.log(
          '[shift-f10]',
          (await page.locator('body').ariaSnapshot()).slice(0, 6000)
        )
        throw error
      })
    await page.keyboard.press('Escape')
    await widgetAction(page, 1, 'Configurer…')
    await expect(
      page
        .getByRole('dialog', { name: 'Inspecteur', exact: true })
        .getByLabel('Expression de dés', { exact: true })
    ).toBeVisible()

    // Mobile : pas de défilement horizontal, inspecteur en feuille basse.
    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload()
    await waitForHydration(page)
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth
      )
    ).toBe(true)
    const panel = await inspect(page, 1)
    const box = await panel.boundingBox()
    expect(box?.y ?? 0).toBeGreaterThan(200)
    expect(Math.round(box?.width ?? 0)).toBe(375)
  } finally {
    await deleteAccountWithClient(client)
  }
})

test('3a-2: project page keeps creation and resources in menus, panels keep drafts', async ({
  page,
}) => {
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  try {
    const projectId = await client.mutation(api.gm.createProject, {
      title: 'Ergonomie 3a-2',
    })
    await page.goto(`/app/projects/${projectId}`)
    await waitForHydration(page)
    // Retour, 3 onglets, ＋, ⚙ et « Racine » ; listes exclues.
    const controls = await page.locator('main').evaluate((main) => {
      const list = main.querySelector('[aria-label="Contenu du dossier"]')
      return [
        ...main.querySelectorAll<HTMLElement>(
          'button, select, input, textarea, a[href]'
        ),
      ].filter((element) => {
        if (list?.contains(element)) return false
        const box = element.getBoundingClientRect()
        return box.width > 0 && box.height > 0
      }).length
    })
    expect(controls).toBeLessThanOrEqual(8)
    await expect(page.getByRole('textbox')).toHaveCount(0)

    await createFrom(page, 'Nouveau', 'Screen…')
    await page.getByRole('textbox', { name: 'Créer un Screen' }).fill('Menus')
    await page.getByRole('button', { name: 'Créer un Screen' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.getByRole('link', { name: 'Menus →' })).toBeVisible()

    // Un brouillon de définition survit à la fermeture du panneau.
    await projectResource(page, 'Widgets personnalisés…')
    await page
      .getByRole('button', { name: 'Créer un widget personnalisé' })
      .click()
    await page
      .getByLabel('Nom du widget personnalisé', { exact: true })
      .fill('Brouillon 3a-2')
    await page.keyboard.press('Escape')
    await expect(
      page.getByLabel('Nom du widget personnalisé', { exact: true })
    ).toBeHidden()
    await projectResource(page, 'Widgets personnalisés…')
    await expect(
      page.getByLabel('Nom du widget personnalisé', { exact: true })
    ).toHaveValue('Brouillon 3a-2')
    await page
      .getByRole('button', { name: 'Fermer widgets personnalisés' })
      .click()
    await projectResource(page, 'Widgets personnalisés…')
    await expect(
      page.getByLabel('Nom du widget personnalisé', { exact: true })
    ).toHaveValue('Brouillon 3a-2')

    // Les onglets mènent aux autres pages du projet, sans formulaire ouvert.
    await page
      .getByRole('navigation', { name: 'Sections du projet' })
      .getByRole('link', { name: 'Variables' })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Variables du projet' })
    ).toBeVisible()
    await expect(
      page.getByRole('form', { name: 'Nouvelle variable' })
    ).toHaveCount(0)
  } finally {
    await deleteAccountWithClient(client)
  }
})
