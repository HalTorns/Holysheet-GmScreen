import '../../src/styles.css'
import type { Layout, Widget } from '@convex/lib/gmFormats'
import { defaultWidgetStyle } from '@shared/gm'
import type * as ConvexReact from 'convex/react'
import { toast, Toaster } from 'sonner'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'
import { userEvent } from 'vitest/browser'

import { z } from '../../shared/zod'
import { Button } from '../../src/components/ui/button'
import { Input } from '../../src/components/ui/input'
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuTrigger,
} from '../../src/components/ui/menu'
import { LayoutEditor } from '../../src/features/gm/layout-editor'

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

const ring = 'rgb(108, 182, 255)'
const legacy = {
  ...defaultWidgetStyle,
  background: '#ffffff',
  color: '#202a24',
  borderColor: '#d6d9d4',
}
const owned = {
  _creationTime: 0,
  ownerId: 'owner',
  projectId: 'project',
  screenId: 'screen',
  updatedAt: 0,
  formatVersion: 2,
  version: 0,
}
const widget = (id: string) =>
  z
    .custom<Widget>(() => true)
    .parse({
      ...owned,
      _id: id,
      kind: 'dice',
      config: { title: '', expression: '1d6' },
      state: {},
    })
const styles = [
  legacy,
  { ...legacy, background: '#ff0000' },
  { ...legacy, color: '#202a24', background: '#faf7f0' },
]
const layout = z
  .custom<Layout>(() => true)
  .parse({
    ...owned,
    _id: 'layout',
    kind: 'digital',
    unit: 'px',
    name: 'Écran',
    width: 1920,
    height: 1080,
    placements: styles.map((style, index) => ({
      widgetId: `w${index}`,
      x: index * 260,
      y: 0,
      width: 240,
      height: 200,
      layer: index,
      style,
    })),
  })

function Editor() {
  return (
    <LayoutEditor
      layout={layout}
      notes={styles.map((_, index) => widget(`w${index}`))}
      variables={[]}
      mode="edit"
      locked={false}
      autoSave={false}
      grid={false}
      dialog={null}
      toolbarSlot={null}
      onDialogChange={() => undefined}
      onDirtyChange={() => undefined}
      onProfileCreated={() => undefined}
    />
  )
}

function css(element: Element, property: string) {
  return getComputedStyle(element).getPropertyValue(property)
}

// Les couleurs sont animées (transition-colors) : on attend la valeur finale.
async function expectRing(element: Element) {
  await expect
    .poll(() => [css(element, 'outline-width'), css(element, 'outline-color')])
    .toEqual(['2px', ring])
}

test('old light widget palettes switch to the dark theme as a whole, chosen ones are kept', async () => {
  const screen = await render(<Editor />)
  const frame = (index: number) =>
    screen.getByRole('region', { name: `Widget dice ${index}` }).element()
  expect(css(frame(1), 'background-color')).toBe('rgb(23, 27, 33)')
  expect(css(frame(2), 'background-color')).toBe('rgb(255, 0, 0)')
  expect(css(frame(3), 'background-color')).toBe('rgb(250, 247, 240)')
  expect(css(frame(3), 'color')).toBe('rgb(32, 42, 36)')
  // L'en-tête garde ses couleurs : le texte sombre choisi reste au contenu.
  const handle = screen
    .getByRole('button', { name: 'Déplacer la note 3' })
    .element()
  expect(css(handle, 'color')).toBe('rgb(232, 234, 237)')
})

test('editing an unrelated style field from the inspector converts old defaults and keeps a chosen palette', async () => {
  mutation.mockClear()
  const screen = await render(<Editor />)
  for (const index of [1, 3]) {
    await screen
      .getByRole('button', { name: `Configurer le widget ${index}` })
      .click()
    await screen.getByRole('tab', { name: 'Style' }).click()
    await screen.getByLabelText('Taille du texte').fill('20')
  }
  await screen
    .getByRole('button', { name: 'Enregistrer la disposition' })
    .click()
  await expect.poll(() => mutation.mock.calls.length).toBeGreaterThan(0)
  const calls: unknown[][] = mutation.mock.calls
  const placements = calls
    .flat()
    .flatMap((args: unknown) =>
      typeof args === 'object' && args !== null && 'placements' in args
        ? [args.placements]
        : []
    )
    .at(-1)
  expect(placements).toEqual([
    expect.objectContaining({
      widgetId: 'w0',
      style: { ...defaultWidgetStyle, fontSize: 20 },
    }),
    expect.objectContaining({ widgetId: 'w1', style: styles[1] }),
    expect.objectContaining({
      widgetId: 'w2',
      style: { ...styles[2], fontSize: 20 },
    }),
  ])
})

test('outline buttons keep the theme text inside a widget with a kept light palette', async () => {
  const screen = await render(
    <div style={{ background: '#faf7f0', color: '#202a24' }}>
      <Button variant="outline">Éditer</Button>
    </div>
  )
  const button = screen.getByRole('button', { name: 'Éditer' }).element()
  await expect.poll(() => css(button, 'color')).toBe('rgb(232, 234, 237)')
})

test('save states and errors keep a dark surface inside a widget with a kept light palette', async () => {
  const screen = await render(
    <section
      data-widget-id="w"
      style={{ background: '#faf7f0', color: '#202a24' }}
    >
      <span role="status" className="save-status" data-save-state="error">
        Échec de sauvegarde
      </span>
      <p role="alert" className="field-error">
        Enregistrement refusé
      </p>
    </section>
  )
  for (const element of [
    screen.getByRole('status').element(),
    screen.getByRole('alert').element(),
  ]) {
    expect(css(element, 'background-color')).toBe('rgb(23, 27, 33)')
    expect(css(element, 'color')).toBe('rgb(255, 143, 135)')
  }
})

test('keyboard focus draws a 2 px frost outline on buttons, fields and menu items', async () => {
  const screen = await render(
    <>
      <Button>Valider</Button>
      <Input aria-label="Libellé" />
      <Menu>
        <MenuTrigger render={<Button variant="outline" />}>Actions</MenuTrigger>
        <MenuContent>
          <MenuItem>Configurer</MenuItem>
        </MenuContent>
      </Menu>
    </>
  )
  await userEvent.keyboard('{Tab}')
  const button = screen.getByRole('button', { name: 'Valider' }).element()
  expect(document.activeElement).toBe(button)
  await expectRing(button)
  await userEvent.keyboard('{Tab}')
  const field = screen.getByLabelText('Libellé').element()
  expect(document.activeElement).toBe(field)
  await expectRing(field)
  await userEvent.keyboard('{Tab}{Enter}')
  const item = screen.getByRole('menuitem', { name: 'Configurer' })
  await expect.element(item).toHaveFocus()
  await expectRing(item.element())
})

test('notifications use the dark theme and the self-hosted fonts apply', async () => {
  const screen = await render(
    <>
      <div className="page-heading">
        <h1>Titre</h1>
      </div>
      <Toaster theme="dark" richColors />
    </>
  )
  toast.success('Pseudo enregistré.')
  const message = screen.getByText('Pseudo enregistré.')
  await expect.element(message).toBeVisible()
  const card = message.element().closest('[data-sonner-toast]')
  if (!card) throw new Error('notification absente')
  const channels = (css(card, 'background-color').match(/\d+/g) ?? [])
    .slice(0, 3)
    .map((channel) => {
      const value = Number(channel) / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
  expect(channels).toHaveLength(3)
  let luminance = 0
  for (const [index, weight] of [0.2126, 0.7152, 0.0722].entries())
    luminance += weight * (channels[index] ?? 1)
  expect(luminance).toBeLessThan(0.1)
  expect(css(document.body, 'font-family')).toMatch(/^"IBM Plex Sans Variable"/)
  expect(
    css(screen.getByRole('heading', { name: 'Titre' }).element(), 'font-family')
  ).toMatch(/^"Inter Tight Variable"/)
})
