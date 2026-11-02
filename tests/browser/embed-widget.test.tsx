import type { Widget } from '@convex/lib/gmFormats'
import type * as ConvexReact from 'convex/react'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'

import { z } from '../../shared/zod'
import { EmbedWidget } from '../../src/features/gm/embed-widget'

const { mutation } = vi.hoisted(() => ({
  mutation: vi.fn().mockResolvedValue(1),
}))
vi.mock('convex/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReact>()),
  useMutation: () => mutation,
}))
vi.mock('../../src/components/draft-guard', () => ({ DraftGuard: () => null }))
vi.mock('../../src/features/gm/revision-history', () => ({
  RevisionHistory: () => null,
}))
const config = {
  title: 'Référence',
  url: 'https://EXAMPLE.com.:443/a b',
  mode: 'link' as const,
}
const widget = z.custom<Extract<Widget, { kind: 'embed' }>>().parse({
  _id: 'embed',
  _creationTime: 0,
  ownerId: 'owner',
  projectId: 'project',
  screenId: 'screen',
  updatedAt: 0,
  formatVersion: 2,
  version: 0,
  kind: 'embed',
  config,
  state: {},
})
const previewProps = {
  readOnly: true,
  locked: false,
  autoSave: false,
  onDirtyChange: () => undefined,
}
function preview(value: typeof widget.config) {
  return <EmbedWidget {...previewProps} widget={{ ...widget, config: value }} />
}
// DOM contracts are the security boundary here, not an iframe load event:
// browsers also fire load when embedding is denied.
test('link uses the validated serialized URL, new tab and isolation attributes', async () => {
  const screen = await render(preview(config))
  const link = screen
    .getByRole('link', { name: 'Référence', exact: true })
    .element()
  expect(link.getAttribute('href')).toBe('https://example.com/a%20b')
  expect(link.getAttribute('target')).toBe('_blank')
  expect(link.getAttribute('rel')).toBe('noopener noreferrer')
  await expect
    .element(screen.getByText('example.com', { exact: true }))
    .toBeVisible()
})
test('frame sandbox is exact and fallback is permanent', async () => {
  const screen = await render(preview({ ...config, mode: 'frame' }))
  const frame = screen.container.querySelector('iframe')
  expect(frame?.getAttribute('src')).toBe('https://example.com/a%20b')
  expect(frame?.getAttribute('sandbox')).toBe(
    'allow-scripts allow-same-origin allow-forms'
  )
  expect(frame?.getAttribute('referrerpolicy')).toBe('no-referrer')
  expect(frame?.getAttribute('allow')).toBe('')
  expect(frame?.getAttribute('loading')).toBe('lazy')
  expect(frame?.hasAttribute('credentialless')).toBe(true)
  await expect
    .element(screen.getByRole('link', { name: 'Ouvrir dans un nouvel onglet' }))
    .toBeVisible()
  await expect
    .element(
      screen.getByText("Si rien ne s'affiche, ce site refuse l'intégration.")
    )
    .toBeVisible()
  await expect
    .element(screen.getByText('example.com', { exact: true }))
    .toBeVisible()
})
test('empty, invalid stored URL and static rendering never emit active content', async () => {
  const screen = await render(preview({ ...config, url: '' }))
  await expect
    .element(screen.getByText('Configurer le lien').last())
    .toBeVisible()
  expect(screen.container.querySelector('a, iframe')).toBeNull()
  await screen.rerender(
    preview({ ...config, url: 'https://127.1', mode: 'frame' })
  )
  await expect
    .element(screen.getByText('https://127.1', { exact: true }).last())
    .toBeVisible()
  expect(screen.container.querySelector('a, iframe')).toBeNull()
  await screen.rerender(preview({ ...config, mode: 'frame' }))
  // Inspect the production print branch; the E2E also activates print media.
  const print = screen.container.querySelector('.hidden')
  expect(print?.textContent).toContain('Référence')
  expect(print?.textContent).toContain('https://example.com/a%20b')
  expect(print?.textContent).toContain('contenu intégré non imprimable')
  expect(print?.querySelector('a, iframe')).toBeNull()
})
test('live validation blocks save; concurrent version preserves the draft until discarded', async () => {
  const props = {
    widget,
    readOnly: false,
    locked: false,
    autoSave: false,
    onDirtyChange: () => undefined,
  }
  const screen = await render(<EmbedWidget {...props} />)
  await screen
    .getByLabelText('URL du lien', { exact: true })
    .fill('https://127.1')
  await expect
    .element(
      screen.getByRole('button', { name: 'Enregistrer le widget', exact: true })
    )
    .toBeDisabled()
  await screen
    .getByLabelText('URL du lien', { exact: true })
    .fill('https://public.example.com')
  await screen.rerender(
    <EmbedWidget
      {...props}
      widget={{
        ...widget,
        version: 1,
        config: { ...config, title: 'Distant' },
      }}
    />
  )
  await expect
    .element(screen.getByLabelText('URL du lien', { exact: true }))
    .toHaveValue('https://public.example.com')
  await expect
    .element(screen.getByRole('alert'))
    .toHaveTextContent('Votre brouillon est conservé')
  await screen
    .getByRole('button', {
      name: 'Charger la version enregistrée',
      exact: true,
    })
    .click()
  await expect
    .element(screen.getByLabelText('Titre du widget', { exact: true }))
    .toHaveValue('Distant')
})
