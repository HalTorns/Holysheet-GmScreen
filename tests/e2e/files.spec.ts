import { readFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

import { api } from '../../convex/_generated/api'
import { backendUrl, backendSiteUrl } from '../../scripts/local-config.mjs'
import { FILE_PDF_BYTES } from '../../shared/files'
import { fileStorageIds } from './backend-operator'
import { projectResource, rowAction, screenMenu } from './editor-ui'
import { uploadFixture } from './files-fixtures'
import {
  createEmail,
  deleteAccountWithClient,
  getAuthenticatedClient,
  signInWithEmail,
  waitForHydration,
  SITE_URL,
} from './helpers'

test('fichiers privés : MIME réel, image/PDF sous CSP, collage et cycle de corbeille', async ({
  page,
}) => {
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  try {
    const projectId = await client.mutation(api.gm.createProject, {
      title: 'Fichiers F6',
    })
    const screenId = await client.mutation(api.gm.createScreen, {
      projectId,
      title: 'Images et PDF',
      format: 'digital',
    })
    await page.goto(`/app/projects/${projectId}`)
    await waitForHydration(page)
    await projectResource(page, 'Fichiers du projet…')
    const input = page.getByLabel('Importer un fichier', { exact: true })
    for (const name of ['pixel.png', 'two-pages.pdf'] as const) {
      await input.setInputFiles(
        new URL(`../fixtures/files/${name}`, import.meta.url).pathname
      )
      await expect(
        page.getByRole('button', { name: `Actions de ${name}`, exact: true })
      ).toBeVisible()
      await expect(input).toBeEnabled()
    }
    const imported = await client.query(api.gmFiles.listFiles, {
      projectId,
      trash: false,
      paginationOpts: { cursor: null, numItems: 20 },
    })
    const imageFile = imported.page.find((file) => file.name === 'pixel.png')
    const pdfFile = imported.page.find((file) => file.name === 'two-pages.pdf')
    if (!imageFile || !pdfFile) throw new Error('Missing UI uploads')
    const image = { id: imageFile._id }
    const pdf = { id: pdfFile._id }
    const polyglot = await uploadFixture(
      page.context(),
      projectId,
      'polyglot.gif'
    )
    for (const [file, mimeType] of [
      [image, 'image/png'],
      [pdf, 'application/pdf'],
      [polyglot, 'image/gif'],
    ] as const) {
      const widgetId = await client.mutation(api.gmFiles.placeFile, {
        screenId,
        fileId: file.id,
      })
      const resolved = await client.query(api.gmFiles.getWidgetFile, {
        widgetId,
      })
      if (!resolved) throw new Error('Missing uploaded file URL')
      expect(new URL(resolved.url).origin).toBe(new URL(backendUrl).origin)
      expect(new URL(resolved.url).origin).not.toBe(
        new URL(backendSiteUrl).origin
      )
      const served = await page.request.get(resolved.url)
      expect(served.ok()).toBe(true)
      expect(served.headers()['content-type']).toBe(mimeType)
    }
    const response = await page.goto(`/app/screens/${screenId}`)
    await waitForHydration(page)
    const csp = response?.headers()['content-security-policy'] ?? ''
    expect(csp.split('img-src')[1]?.split(';')[0]).toContain(
      new URL(backendUrl).origin
    )
    expect(csp.split('connect-src')[1]?.split(';')[0]).toContain(
      new URL(backendSiteUrl).origin
    )
    await expect(
      page.getByRole('img', { name: 'pixel.png', exact: true })
    ).toBeVisible()
    await expect
      .poll(() =>
        page
          .getByRole('img', { name: 'pixel.png', exact: true })
          .evaluate(
            (element) =>
              element instanceof HTMLImageElement &&
              element.complete &&
              element.naturalWidth > 0
          )
      )
      .toBe(true)
    await expect(page.getByText('Page 1 / 2', { exact: true })).toBeVisible()
    // Les widgets placés par placeFile se superposent : on active le bouton au
    // clavier, sans dépendre de l'ordre d'empilement.
    await page
      .getByRole('button', { name: 'Page suivante', exact: true })
      .press('Enter')
    await expect
      .poll(
        async () =>
          (
            await client.query(api.gmWidgets.getScreenWidgetMetadata, {
              screenId,
            })
          ).find((widget) => widget.kind === 'pdf')?.state
      )
      .toEqual({ page: 2 })
    await page.reload()
    await waitForHydration(page)
    await expect(page.getByText('Page 2 / 2', { exact: true })).toBeVisible()
    const bytes = [
      ...(await readFile(
        new URL('../fixtures/files/pixel.png', import.meta.url)
      )),
    ]
    await page.evaluate((data) => {
      const transfer = new DataTransfer()
      transfer.items.add(
        new File([new Uint8Array(data)], 'clipboard.png', { type: 'image/png' })
      )
      document.querySelector('h1')?.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData: transfer,
          bubbles: true,
          cancelable: true,
        })
      )
    }, bytes)
    await expect(
      page.getByRole('img', { name: 'clipboard.png', exact: true })
    ).toBeVisible()
    // Les fichiers du projet sont dans un tiroir ouvert depuis ⚙ (chantier 3a).
    await screenMenu(page, 'Fichiers du projet…')
    await expect(
      page.getByText('clipboard.png · image/png', { exact: false })
    ).toBeVisible()
    page.on('dialog', (dialog) => {
      void dialog.accept()
    })
    await rowAction(page, 'pixel.png', 'Corbeille pixel.png')
    await expect(
      page.getByText('Fichier indisponible', { exact: true })
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Corbeille des fichiers', exact: true })
      .click()
    await rowAction(page, 'pixel.png', 'Restaurer pixel.png')
    await expect(
      page.getByRole('img', { name: 'pixel.png', exact: true })
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Fichiers actifs', exact: true })
      .click()
    await rowAction(page, 'pixel.png', 'Corbeille pixel.png')
    await expect(
      page.getByText('Fichier indisponible', { exact: true })
    ).toBeVisible()
    await page
      .getByRole('button', { name: 'Corbeille des fichiers', exact: true })
      .click()
    await rowAction(page, 'pixel.png', 'Purger pixel.png')
    await expect(
      page.getByRole('button', { name: 'Actions de pixel.png', exact: true })
    ).toHaveCount(0)
    expect(await page.evaluate(() => 'polyglotExecuted' in window)).toBe(false)
    // Real HTTP transport supplies Content-Length; reject before storage.
    const tokenResponse = await page.request.get(
      `${SITE_URL}/api/auth/convex/token`
    )
    const payload: unknown = await tokenResponse.json()
    if (
      !payload ||
      typeof payload !== 'object' ||
      !('token' in payload) ||
      typeof payload.token !== 'string'
    )
      throw new Error('Missing file token')
    const before = await client.query(api.gm.exportCollection, {
      collection: 'gmFiles',
      paginationOpts: { cursor: null, numItems: 20 },
    })
    const blobsBefore = new Set(fileStorageIds())
    const oversized = await page.request.post(
      `${backendSiteUrl}/files/upload?projectId=${projectId}`,
      {
        headers: { Origin: SITE_URL, Authorization: `Bearer ${payload.token}` },
        data: Buffer.alloc(FILE_PDF_BYTES + 1),
      }
    )
    expect(oversized.status()).toBe(413)
    expect(fileStorageIds().filter((id) => !blobsBefore.has(id)).length).toBe(0)
    expect(await oversized.json()).toMatchObject({ code: 'FILE_TOO_LARGE' })
    expect(
      (
        await client.query(api.gm.exportCollection, {
          collection: 'gmFiles',
          paginationOpts: { cursor: null, numItems: 20 },
        })
      ).page
    ).toEqual(before.page)
  } finally {
    await deleteAccountWithClient(client)
  }
})
