import { randomUUID } from 'node:crypto'

import { expect, test } from '@playwright/test'
import { z } from 'zod'

import { api } from '../../convex/_generated/api'
import { ageSession, grantApplicationAdmin } from './backend-operator'
import {
  SITE_URL,
  createEmail,
  createResource,
  deleteAccountWithClient,
  finishIdentityConfirmation,
  getAuthenticatedClient,
  identityMailbox,
  requestSignInCode,
  signInWithEmail,
} from './helpers'

// Real transport and UI contracts absent from the backend owner tests.
test('un formulaire conserve le brouillon après conflit et avertit avant une navigation', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  try {
    const title = `Version ${randomUUID()}`
    await createResource(page, title)
    const resource = (
      await client.query(api.resources.list, {
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).page[0]
    if (!resource) throw new Error('Missing resource fixture')
    await page
      .getByRole('button', { name: `Modifier ${title}`, exact: true })
      .click()
    await page
      .getByLabel('Titre', { exact: true })
      .fill('Mon brouillon conservé')
    await page.getByLabel('Description (facultatif)', { exact: true }).fill('')
    await client.mutation(api.resources.update, {
      id: resource._id,
      expectedUpdatedAt: resource.updatedAt,
      title: 'Version concurrente',
      description: 'Autre modification',
    })
    await page
      .getByRole('button', {
        name: 'Enregistrer les modifications',
        exact: true,
      })
      .click()
    await expect(page.getByRole('alert')).toContainText(
      'brouillon est conservé'
    )
    await expect(page.getByLabel('Titre', { exact: true })).toHaveValue(
      'Mon brouillon conservé'
    )
    await expect(page.getByText('Version actuelle :')).toBeVisible()
    await page
      .getByRole('button', {
        name: 'Conserver mon brouillon et reprendre sur cette version',
      })
      .click()
    await page
      .getByRole('button', {
        name: 'Enregistrer les modifications',
        exact: true,
      })
      .click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page
      .getByLabel('Rechercher une ressource', { exact: true })
      .fill('Mon brouillon')
    await expect(
      page.getByText('Mon brouillon conservé', { exact: true })
    ).toBeVisible()
    await page.getByLabel('Avec une description', { exact: true }).check()
    await expect(
      page.getByText('Aucune ressource ne correspond à ces critères.', {
        exact: true,
      })
    ).toBeVisible()
    await page.getByLabel('Avec une description', { exact: true }).uncheck()
    await expect(
      page.getByText('Mon brouillon conservé', { exact: true })
    ).toBeVisible()
    await page.getByRole('link', { name: 'Compte', exact: true }).click()
    await page.getByLabel('Pseudo', { exact: true }).fill('Brouillon de pseudo')
    await page.getByRole('link', { name: 'Ressources', exact: true }).click()
    await expect(page.getByRole('dialog')).toContainText(
      'Quitter sans enregistrer'
    )
    await page.getByRole('button', { name: 'Rester', exact: true }).click()
    await expect(page.getByLabel('Pseudo', { exact: true })).toHaveValue(
      'Brouillon de pseudo'
    )
    await page.getByRole('link', { name: 'Ressources', exact: true }).click()
    await page
      .getByRole('button', { name: 'Quitter sans enregistrer', exact: true })
      .click()
    await expect(
      page.getByRole('heading', { name: 'Mes ressources.' })
    ).toBeVisible()
  } finally {
    await deleteAccountWithClient(client)
  }
})

test('le pseudo reste modifiable après une heure et les routes génériques ne contournent pas ses règles', async ({
  page,
}) => {
  await signInWithEmail(page, createEmail())
  const client = await getAuthenticatedClient(page.context())
  try {
    const response = await page.request.get('/api/auth/get-session')
    const { session } = z
      .object({ session: z.object({ id: z.string() }) })
      .parse(await response.json())
    ageSession(session.id)
    await page.goto('/app/security')
    await page
      .getByLabel('Pseudo', { exact: true })
      .fill(`Pseudo-${randomUUID().slice(0, 12)}`)
    await page.getByRole('button', { name: 'Enregistrer mon pseudo' }).click()
    await expect(
      page.getByText('Pseudo enregistré.', { exact: true })
    ).toBeVisible()
    for (const data of [
      { name: 'Contournement' },
      { role: 'admin' },
      { nameKey: 'collision' },
      { profileVersion: 0 },
      { adminVersion: 0 },
    ])
      expect(
        (
          await page.request.post('/api/auth/update-user', {
            headers: { Origin: SITE_URL },
            data,
          })
        ).status()
      ).toBe(403)
    await expect(
      client.mutation(api.account.deleteAccount, { confirmation: 'DELETE' })
    ).rejects.toMatchObject({
      data: { code: 'IDENTITY_CONFIRMATION_REQUIRED' },
    })
    let mailbox = await identityMailbox(page)
    await page
      .getByRole('button', { name: 'Supprimer mon compte', exact: true })
      .click()
    await page
      .getByLabel('Saisissez SUPPRIMER pour confirmer')
      .fill('SUPPRIMER')
    await page
      .getByRole('button', { name: 'Supprimer définitivement mon compte' })
      .click()
    await expect(
      page.getByRole('heading', {
        name: 'Confirmer votre identité',
        exact: true,
      })
    ).toBeVisible()
    await page.getByRole('button', { name: 'Annuler la confirmation' }).click()
    await expect(
      page.getByLabel('Saisissez SUPPRIMER pour confirmer')
    ).toHaveValue('SUPPRIMER')
    mailbox = await identityMailbox(page)
    await page
      .getByRole('button', { name: 'Supprimer définitivement mon compte' })
      .click()
    await finishIdentityConfirmation(page, mailbox)
    await expect(page).toHaveURL(`${SITE_URL}/`)
    expect(await client.query(api.auth.getCurrentUser, {})).toBeNull()
  } finally {
    if (await client.query(api.auth.getCurrentUser, {}))
      await deleteAccountWithClient(client)
  }
})

test('l’administration quotidienne fonctionne sans MFA et applique rôle, suspension et audit depuis le site', async ({
  page,
  browser,
}) => {
  // The last-admin invariant intentionally retains this reusable local fixture.
  await signInWithEmail(page, 'boilerplate-admin-e2e@example.test')
  const admin = await getAuthenticatedClient(page.context())
  const actor = await admin.query(api.auth.getCurrentUser, {})
  if (!actor) throw new Error('Missing administrator fixture')
  grantApplicationAdmin(actor.id)
  const response = await page.request.get('/api/auth/get-session')
  ageSession(
    z
      .object({ session: z.object({ id: z.string() }) })
      .parse(await response.json()).session.id
  )
  const other = await browser.newContext({ baseURL: SITE_URL })
  const memberPage = await other.newPage()
  await signInWithEmail(memberPage, createEmail())
  const member = await getAuthenticatedClient(other)
  const target = await member.query(api.auth.getCurrentUser, {})
  if (!target) throw new Error('Missing member fixture')
  try {
    await expect(
      member.query(api.userAdmin.list, {
        search: '',
        paginationOpts: { numItems: 10, cursor: null },
      })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } })
    await page.goto('/app/users')
    await page
      .getByLabel('Rechercher par email', { exact: true })
      .fill(target.email)
    await page.getByRole('link').filter({ hasText: target.email }).click()
    await page.getByLabel('Rôle du compte').selectOption('admin')
    await page.getByRole('button', { name: 'Modifier le rôle' }).click()
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect
      .poll(
        async () => (await member.query(api.auth.getAccessState, {}))?.isAdmin
      )
      .toBe(true)
    await page.getByLabel('Rôle du compte').selectOption('user')
    await page.getByRole('button', { name: 'Modifier le rôle' }).click()
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect
      .poll(
        async () => (await member.query(api.auth.getAccessState, {}))?.isAdmin
      )
      .toBe(false)
    await page.getByLabel('Motif de suspension').fill('Compte de test suspendu')
    await page.getByRole('button', { name: 'Suspendre le compte' }).click()
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click()
    await expect
      .poll(() => member.query(api.auth.getCurrentUser, {}))
      .toBeNull()
    await page.getByRole('button', { name: 'Réactiver le compte' }).click()
    await page.getByRole('button', { name: 'Confirmer', exact: true }).click()
    expect(await member.query(api.auth.getCurrentUser, {})).toBeNull()
    await expect(
      page.getByText('Compte réactivé', { exact: false })
    ).toBeVisible()
    await signInWithEmail(memberPage, target.email)
  } finally {
    const current = await getAuthenticatedClient(other)
    if (await current.query(api.auth.getCurrentUser, {}))
      await deleteAccountWithClient(current)
    await other.close()
  }
})

// Only the browser owns this mounting boundary: reactive profile updates must
// not discard an onboarding draft before its owner explicitly finishes.
test('le choix initial conserve sa saisie quand le pseudo change dans un autre onglet', async ({
  page,
}) => {
  const email = createEmail()
  const otp = await requestSignInCode(page.context(), email)
  expect(
    (
      await page.request.post('/api/auth/sign-in/email-otp', {
        headers: { Origin: SITE_URL },
        data: { email, otp },
      })
    ).status()
  ).toBe(200)
  await page.goto('/app')
  const client = await getAuthenticatedClient(page.context())
  try {
    await page.getByLabel('Pseudo', { exact: true }).fill('Mon choix conservé')
    const profile = await client.query(api.auth.getCurrentUser, {})
    if (!profile) throw new Error('Missing onboarding fixture')
    await client.mutation(api.account.setDisplayName, {
      name: `Autre-${randomUUID().slice(0, 12)}`,
      expectedVersion: profile.profileVersion,
    })
    await expect(
      page.getByText('Un pseudo a été enregistré dans un autre onglet', {
        exact: false,
      })
    ).toBeVisible()
    await expect(page.getByLabel('Pseudo', { exact: true })).toHaveValue(
      'Mon choix conservé'
    )
    await page.getByRole('button', { name: 'Continuer', exact: true }).click()
    await expect(page.getByRole('alert')).toContainText(
      'brouillon est conservé'
    )
    await page
      .getByRole('button', {
        name: 'Conserver ma saisie et reprendre sur cette version',
      })
      .click()
    // Avoid claiming a fixed pseudo across parallel or repeated local runs.
    await page
      .getByLabel('Pseudo', { exact: true })
      .fill(`Mon-${randomUUID().slice(0, 12)}`)
    await page.getByRole('button', { name: 'Continuer', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Nouvelle ressource', exact: true })
    ).toBeEnabled()
  } finally {
    await deleteAccountWithClient(client)
  }
})
