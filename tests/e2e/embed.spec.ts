import { expect, test } from '@playwright/test'

import { api } from '../../convex/_generated/api'
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
    await page
      .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
      .uncheck()
    await page
      .getByLabel('Type de widget', { exact: true })
      .selectOption('embed')
    // Keyboard activation is reliable even when placed widgets overlap.
    await page
      .getByRole('button', { name: 'Ajouter un widget', exact: true })
      .press('Enter')
    const widget = page.getByRole('region', {
      name: 'Widget embed 1',
      exact: true,
    })
    await expect(
      widget.getByText('Configurer le lien', { exact: true }).last()
    ).toBeVisible()
    await expect(widget.locator('a, iframe')).toHaveCount(0)
    await widget
      .getByLabel('Titre du widget', { exact: true })
      .fill('Référence F7b')
    await widget.getByLabel('URL du lien', { exact: true }).fill(allowedUrl)
    await widget
      .getByLabel('Mode du lien', { exact: true })
      .selectOption('frame')
    const save = widget.getByRole('button', {
      name: 'Enregistrer le widget',
      exact: true,
    })
    await save.press('Enter')
    await expect(save).toBeDisabled()
    await expect(
      widget
        .frameLocator('iframe')
        .getByRole('heading', { name: 'Embedded reference F7b', exact: true })
    ).toBeVisible()
    await page.reload()
    await waitForHydration(page)
    await expect(widget.getByLabel('URL du lien', { exact: true })).toHaveValue(
      allowedUrl
    )
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
    await page
      .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
      .uncheck()
    await widget.getByLabel('URL du lien', { exact: true }).fill(deniedUrl)
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
    await page
      .getByRole('button', { name: 'Lecture seule', exact: true })
      .press('Enter')
    await expect(
      page.getByRole('button', { name: 'Reprendre l’édition', exact: true })
    ).toBeVisible()
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
