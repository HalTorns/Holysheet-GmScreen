import { expect, test } from '@playwright/test'

import { api } from '../../convex/_generated/api'
import {
  addMenu,
  closeInspector,
  inspect,
  setAutoSave,
  setMode,
} from './editor-ui'
import {
  createEmail,
  deleteAccountWithClient,
  getAuthenticatedClient,
  signInWithEmail,
  waitForHydration,
} from './helpers'

test('embed: menu, canonical persistence, HTTPS frame, denied frame fallback and print under CSP', async ({
  page,
}) => {
  const allowedUrl = 'https://allowed.example.com/reference'
  const deniedUrl = 'https://denied.example.com/reference'
  // Register before navigation: these production-valid hosts never reach DNS
  // or the network. The production URL policy is used without a test bypass.
  await page.route('https://allowed.example.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><body><h1>Embedded reference F7b</h1></body></html>',
    })
  )
  await page.route('https://denied.example.com/**', (route) =>
    route.fulfill({
      contentType: 'text/html',
      headers: { 'X-Frame-Options': 'DENY' },
      body: '<!doctype html><html><body><h1>Forbidden reference F7b</h1></body></html>',
    })
  )
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  try {
    const projectId = await client.mutation(api.gm.createProject, {
      title: 'Embed F7b',
    })
    const screenId = await client.mutation(api.gm.createScreen, {
      projectId,
      title: 'Embed',
      format: 'digital',
    })
    const response = await page.goto(`/app/screens/${screenId}`)
    await waitForHydration(page)
    expect(response?.headers()['content-security-policy']).toMatch(
      /(?:^|;\s*)frame-src https: https?:\/\/[^;]+\/sandbox\/host(?:;|$)/
    )
    await setAutoSave(page, false)
    await addMenu(page, 'Médias et liens', 'Lien web')
    const widget = page.getByRole('region', {
      name: 'Widget embed 1',
      exact: true,
    })
    await expect(
      widget.getByText('Configurer le lien', { exact: true }).last()
    ).toBeVisible()
    await expect(widget.locator('a, iframe')).toHaveCount(0)
    let panel = await inspect(page, 1)
    await panel
      .getByLabel('Titre du widget', { exact: true })
      .fill('Référence F7b')
    await panel.getByLabel('URL du lien', { exact: true }).fill(allowedUrl)
    await panel
      .getByLabel('Mode du lien', { exact: true })
      .selectOption('frame')
    let save = panel.getByRole('button', {
      name: 'Enregistrer le widget',
      exact: true,
    })
    await save.press('Enter')
    await expect(save).toHaveCount(0)
    await expect(
      widget
        .frameLocator('iframe')
        .getByRole('heading', { name: 'Embedded reference F7b', exact: true })
    ).toBeVisible()
    await page.reload()
    await waitForHydration(page)
    await expect(
      (await inspect(page, 1)).getByLabel('URL du lien', { exact: true })
    ).toHaveValue(allowedUrl)
    await closeInspector(page)
    await expect(
      widget
        .frameLocator('iframe')
        .getByRole('heading', { name: 'Embedded reference F7b', exact: true })
    ).toBeVisible()
    await expect(widget.locator('iframe')).toHaveAttribute(
      'sandbox',
      'allow-scripts allow-same-origin allow-forms'
    )
    await expect(widget.locator('iframe')).toHaveAttribute(
      'referrerpolicy',
      'no-referrer'
    )
    await expect(widget.locator('iframe')).toHaveAttribute('allow', '')
    await expect(widget.locator('iframe')).toHaveAttribute('credentialless', '')
    await expect(
      widget.getByText('allowed.example.com', { exact: true })
    ).toBeVisible()
    const fallback = widget.getByRole('link', {
      name: 'Ouvrir dans un nouvel onglet',
      exact: true,
    })
    await expect(fallback).toHaveAttribute('href', allowedUrl)
    await expect(fallback).toHaveAttribute('target', '_blank')
    await expect(fallback).toHaveAttribute('rel', 'noopener noreferrer')
    await setAutoSave(page, false)
    panel = await inspect(page, 1)
    await panel.getByLabel('URL du lien', { exact: true }).fill(deniedUrl)
    save = panel.getByRole('button', {
      name: 'Enregistrer le widget',
      exact: true,
    })
    // Wait for the browser's load (also emitted for blocked frames) before
    // asserting absence. A response alone precedes the embedding decision.
    const deniedLoad = widget.locator('iframe').evaluate(
      (element) =>
        new Promise<void>((resolve) => {
          element.addEventListener('load', () => resolve(), { once: true })
        })
    )
    const deniedResponse = page.waitForResponse(deniedUrl)
    await save.press('Enter')
    expect((await deniedResponse).headers()['x-frame-options']).toBe('DENY')
    await deniedLoad
    await expect(
      widget
        .frameLocator('iframe')
        .getByText('Forbidden reference F7b', { exact: true })
    ).toHaveCount(0)
    await expect(fallback).toHaveAttribute('href', deniedUrl)
    await expect(
      widget.getByText('denied.example.com', { exact: true })
    ).toBeVisible()
    await expect(
      widget.getByText("Si rien ne s'affiche, ce site refuse l'intégration.", {
        exact: true,
      })
    ).toBeVisible()
    await setMode(page, 'Lecture')
    await expect(
      page.getByRole('radio', { name: 'Lecture', exact: true })
    ).toHaveAttribute('aria-checked', 'true')
    await expect(fallback).toBeVisible()
    await page.emulateMedia({ media: 'print' })
    await expect(widget.locator('iframe')).not.toBeVisible()
    await expect(
      widget.getByText('contenu intégré non imprimable', { exact: true })
    ).toBeVisible()
    await expect(widget.getByText(deniedUrl, { exact: true })).toBeVisible()
  } finally {
    await deleteAccountWithClient(client)
  }
})
