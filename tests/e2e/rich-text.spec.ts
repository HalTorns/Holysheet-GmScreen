import { randomUUID } from 'node:crypto'

import type { Page } from '@playwright/test'
import { expect, test } from '@playwright/test'

import { api } from '../../convex/_generated/api'
import {
  completeProfile,
  createEmail,
  deleteAccountWithClient,
  getAuthenticatedClient,
  readMailbox,
  waitForVerificationCode,
  waitForHydration,
} from './helpers'

test('rich notes activate literally, paste safely, synchronize, conflict and restore plain revisions', async ({
  page,
  context,
}) => {
  test.setTimeout(300_000)
  const email = createEmail()
  const password = `Synthetic-${randomUUID()}`
  let client: Awaited<ReturnType<typeof getAuthenticatedClient>> | undefined
  const second = await context.newPage()
  const violations: string[] = []
  await context.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => {
      console.error(`F4b-CSP:${event.violatedDirective}`)
    })
  })
  page.on('console', (message) => {
    if (message.text().startsWith('F4b-CSP:')) violations.push(message.text())
  })
  let hostileRequests = 0
  await context.route('https://evil.test/**', async (route) => {
    hostileRequests += 1
    await route.abort()
  })
  try {
    await page.goto('/sign-in')
    await waitForHydration(page)
    await page
      .getByRole('button', { name: 'Créer un compte', exact: true })
      .click()
    await page
      .getByLabel('Pseudo', { exact: true })
      .fill(`Budget ${randomUUID().slice(0, 8)}`)
    await page.getByLabel('Adresse email', { exact: true }).fill(email)
    await page.getByLabel('Mot de passe', { exact: true }).fill(password)
    const previous = new Set(await readMailbox(email))
    await page
      .getByRole('button', { name: 'Créer mon compte', exact: true })
      .click()
    await page
      .getByLabel('Code de vérification', { exact: true })
      .fill(await waitForVerificationCode(email, previous))
    await page
      .getByRole('button', { name: 'Vérifier mon adresse', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Retrouvez votre table.' })
    ).toBeVisible()
    await page.getByLabel('Mot de passe', { exact: true }).fill(password)
    await page
      .getByRole('button', { name: 'Se connecter', exact: true })
      .click()
    await expect(page).toHaveURL(/\/app$/)
    await completeProfile(page)
    const authenticated = await getAuthenticatedClient(context)
    client = authenticated

    const projectId = await authenticated.mutation(api.gm.createProject, {
      title: 'Texte riche',
    })
    const screenId = await authenticated.mutation(api.gm.createScreen, {
      projectId,
      title: 'Notes riches',
      format: 'digital',
    })
    const id = await authenticated.mutation(api.gm.addNote, { screenId })
    const literal = '# **littéral** <b>brut</b>'
    await authenticated.mutation(api.gm.updateNote, {
      id,
      expectedVersion: 0,
      body: literal,
    })
    await page.goto(`/app/screens/${screenId}`)
    await waitForHydration(page)
    await page
      .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
      .uncheck()
    const field = page.getByRole('textbox', {
      name: 'Contenu de la note',
      exact: true,
    })
    await expect(field).toHaveValue(literal)
    await page
      .getByRole('button', { name: 'Activer le texte riche', exact: true })
      .click()
    await page.getByRole('button', { name: 'Aperçu', exact: true }).click()
    await expect(
      page.getByRole('region', { name: 'Aperçu de la note', exact: true })
    ).toHaveText(literal)
    await page.getByRole('button', { name: 'Éditer', exact: true }).click()
    await field.fill('sélection')
    await field.selectText()
    await page.getByRole('button', { name: 'Gras', exact: true }).click()
    await expect(field).toHaveValue('**sélection**')
    await expect(field).toBeFocused()
    await field.evaluate((element) => {
      if (!(element instanceof HTMLTextAreaElement))
        throw new Error('Missing textarea')
      element.setSelectionRange(element.value.length, element.value.length)
      const clipboardData = new DataTransfer()
      clipboardData.setData(
        'text/html',
        '<p><b>Word</b> <i>Docs</i></p><a href="https://example.test">sûr</a><a href="jav&#97;script:evil()">refusé</a><img src="https://evil.test/image" onerror="evil()"><script>evil()</script>'
      )
      clipboardData.setData('text/plain', 'Word Docs')
      element.dispatchEvent(
        new ClipboardEvent('paste', {
          clipboardData,
          bubbles: true,
          cancelable: true,
        })
      )
    })
    await expect(field).toHaveValue(/Word/u)
    const pasted = await field.inputValue()
    await field.fill(`${pasted}\n:::details[Résumé]\nsecret\n:::`)
    await page.getByRole('button', { name: 'Enregistrer', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Enregistrer', exact: true })
    ).toBeDisabled()
    await page.reload()
    await waitForHydration(page)
    await page
      .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
      .uncheck()
    await expect(field).toHaveValue(/:::details/u)
    await page
      .getByRole('button', { name: 'Lecture seule', exact: true })
      .click()
    await expect(field).toHaveCount(0)
    await expect(
      page.locator('strong').filter({ hasText: 'Word' })
    ).toBeVisible()
    await expect(
      page.locator('a[href^="javascript"], img[src*="evil"], iframe')
    ).toHaveCount(0)
    await expect(
      page.getByRole('link', { name: 'sûr', exact: true })
    ).toHaveAttribute('rel', 'noopener noreferrer')
    // Le Screen contient d'autres details (historique, outils) : viser le repli de la note.
    await page.locator('summary').filter({ hasText: 'Résumé' }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByText('secret', { exact: true })).toBeVisible()
    await page
      .getByRole('button', { name: 'Reprendre l’édition', exact: true })
      .click()
    await second.goto(page.url())
    await waitForHydration(second)
    await second
      .getByRole('checkbox', { name: 'Sauvegarde automatique', exact: true })
      .uncheck()
    await field.fill('brouillon local')
    await second
      .getByRole('textbox', { name: 'Contenu de la note', exact: true })
      .fill('**distant**')
    await second
      .getByRole('button', { name: 'Enregistrer', exact: true })
      .click()
    await expect(page.getByRole('alert')).toContainText('autre vue')
    await expect(field).toHaveValue('brouillon local')
    await page
      .getByRole('button', {
        name: 'Charger la version enregistrée',
        exact: true,
      })
      .click()
    await expect(field).toHaveValue('**distant**')
    await page
      .getByRole('button', { name: 'Historique de la note', exact: true })
      .click()
    await page
      .getByRole('button', { name: 'Restaurer la version 1', exact: true })
      .click()
    await page.getByRole('button', { name: 'Fermer', exact: true }).click()
    await expect(field).toHaveValue(literal)
    await expect(
      page.getByRole('button', { name: 'Activer le texte riche', exact: true })
    ).toBeVisible()
    await expect
      .poll(
        async () =>
          (await authenticated.query(api.gmWidgets.getNoteContent, { id }))
            .bodyFormat
      )
      .toBe('plain')
    // Measure the actual production Screen in CI, after content/modules load.
    // Timings are evidence, never a flaky time assertion.
    const benchmarkScreen = await authenticated.mutation(api.gm.createScreen, {
      projectId,
      title: 'Mesures riches',
      format: 'digital',
    })
    const benchmarkId = await authenticated.mutation(api.gm.addNote, {
      screenId: benchmarkScreen,
    })
    const maximum = '**gras** texte\n'.repeat(700).padEnd(50_000, 'x')
    await authenticated.mutation(api.gm.updateNote, {
      id: benchmarkId,
      expectedVersion: 0,
      body: maximum,
      bodyFormat: 'markdown-v1',
    })
    await page.goto(`/app/screens/${benchmarkScreen}`)
    await waitForHydration(page)
    await expect(field).toHaveValue(maximum)
    const maximumTimes = await measureScreenRendering(page, 1)
    await authenticated.mutation(api.gm.updateNote, {
      id: benchmarkId,
      expectedVersion: 1,
      body: '**note**\ncontenu',
      bodyFormat: 'markdown-v1',
    })
    const sources = [{ id: benchmarkId, version: 2 }]
    while (sources.length < 100) {
      const structure = await authenticated.query(api.gm.getScreen, {
        id: benchmarkScreen,
      })
      const profile = structure?.layouts.find(
        (layout) => layout.kind === 'digital'
      )
      if (!profile) throw new Error('Missing benchmark profile')
      const copies = await authenticated.mutation(api.gmWidgets.changeNotes, {
        layoutId: profile._id,
        expectedVersion: profile.version,
        notes: sources.slice(0, Math.min(20, 100 - sources.length)),
        operation: 'duplicate',
      })
      sources.push(...copies.map((copy) => ({ id: copy, version: 0 })))
    }
    // AUD-28 : en pagination temps réel, un widget inséré pendant que la vue
    // est ouverte peut manquer (99/100 observé en CI). On consigne le compte
    // vu en direct, puis on mesure le Screen rechargé, qui est l'objet du test.
    const liveCount = await field.count()
    await test.info().attach('rich-text-live-count.json', {
      body: JSON.stringify({ liveCount, expected: 100 }),
      contentType: 'application/json',
    })
    await page.reload()
    await waitForHydration(page)
    await expect(field).toHaveCount(100)
    const hundredTimes = await measureScreenRendering(page, 100)
    await test.info().attach('rich-text-production-render.json', {
      body: JSON.stringify({ maximumTimes, hundredTimes }),
      contentType: 'application/json',
    })
    expect(hostileRequests).toBe(0)
    expect(violations).toEqual([])
  } finally {
    await second.close()
    if (client) await deleteAccountWithClient(client)
  }
})

async function measureScreenRendering(page: Page, count: number) {
  const trials: number[] = []
  for (let trial = 0; trial < 5; trial++) {
    await expect(
      page.getByRole('textbox', { name: 'Contenu de la note', exact: true })
    ).toHaveCount(count)
    const elapsed = await page
      .getByRole('button', { name: 'Lecture seule', exact: true })
      .evaluate(
        (button) =>
          new Promise<number>((resolve) => {
            const start = performance.now()
            const observer = new MutationObserver(() => {
              if (
                document.querySelector(
                  'textarea[aria-label="Contenu de la note"]'
                )
              )
                return
              observer.disconnect()
              requestAnimationFrame(() => {
                document.body.getBoundingClientRect()
                resolve(performance.now() - start)
              })
            })
            observer.observe(document.body, { childList: true, subtree: true })
            if (!(button instanceof HTMLButtonElement))
              throw new Error('Missing read-only button')
            button.click()
          })
      )
    trials.push(elapsed)
    await page
      .getByRole('button', { name: 'Reprendre l’édition', exact: true })
      .click()
  }
  return { trials, median: [...trials].sort((a, b) => a - b)[2], count }
}
