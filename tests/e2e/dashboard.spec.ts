import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { parseEnv } from 'node:util'

import { expect, test } from '@playwright/test'
import type { ConvexHttpClient } from 'convex/browser'

import { api } from '../../convex/_generated/api'
import { dashboardUrl } from '../../scripts/local-config.mjs'
import {
  deleteAccountWithClient,
  createEmail,
  getAuthenticatedClient,
  signInWithEmail,
} from './helpers'

test('le dashboard lit les données locales et ferme sa session admin sans persistance', async ({
  page,
  browser,
}) => {
  const environment = parseEnv(
    await readFile(new URL('../../.env.local', import.meta.url), 'utf-8')
  )
  const adminKey = environment.CONVEX_SELF_HOSTED_ADMIN_KEY
  if (!adminKey) throw new Error('La clé admin locale est absente.')
  const title = `Dashboard ${randomUUID()}`
  const adminContext = await browser.newContext()
  let client: ConvexHttpClient | undefined
  try {
    await signInWithEmail(page, createEmail())
    client = await getAuthenticatedClient(page.context())
    await client.mutation(api.gm.createProject, { title })

    const dashboard = await adminContext.newPage()
    const response = await dashboard.goto(dashboardUrl)
    if (!response?.ok()) throw new Error('Le dashboard local est indisponible.')
    // Assert booleans: a failure must not serialize the credential or HTML.
    expect((await response.text()).includes(adminKey)).toBe(false)
    await expect(
      dashboard.getByLabel('Admin Key', { exact: true })
    ).toBeVisible()
    await dashboard.getByLabel('Admin Key', { exact: true }).fill(adminKey)
    await dashboard.getByRole('button', { name: 'Log In', exact: true }).click()
    await expect(
      dashboard.getByRole('button', {
        name: 'Dashboard Settings',
        exact: true,
      })
    ).toBeVisible()
    await dashboard.getByRole('link', { name: 'Data', exact: true }).click()
    await dashboard
      .getByRole('link', { name: 'gmProjects', exact: true })
      .click()
    await expect(dashboard.getByText(title, { exact: true })).toBeVisible()
    expect(dashboard.url().includes(adminKey)).toBe(false)
    expect(
      await dashboard.evaluate((key) => {
        const stored = sessionStorage.getItem('adminKey')
        return Boolean(stored && JSON.parse(stored) === key)
      }, adminKey)
    ).toBe(true)
    expect(
      await dashboard.evaluate(
        (key) =>
          Object.values(localStorage).some((value: string) =>
            value.includes(key)
          ),
        adminKey
      )
    ).toBe(false)

    await dashboard
      .getByRole('button', { name: 'Dashboard Settings', exact: true })
      .click()
    await dashboard.getByText('Log Out', { exact: true }).click()
    expect(
      await dashboard.evaluate(() => {
        const stored = sessionStorage.getItem('adminKey')
        return !stored || JSON.parse(stored) === ''
      })
    ).toBe(true)
    await dashboard.reload()
    await expect(
      dashboard.getByLabel('Admin Key', { exact: true })
    ).toBeVisible()
  } finally {
    await adminContext.close()
    if (client) await deleteAccountWithClient(client)
  }
})
