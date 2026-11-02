import type { Widget } from '@convex/lib/gmFormats'
import type * as ConvexReact from 'convex/react'
import { useState } from 'react'
import { expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'

import { z } from '../../shared/zod'
import { FileWidget } from '../../src/features/gm/file-widget'
import { PdfView } from '../../src/features/gm/pdf-view'
import imageUrl from '../fixtures/files/pixel.png?url'
import pdfUrl from '../fixtures/files/two-pages.pdf?url'

const { query, mutation } = vi.hoisted(() => ({
  query: vi.fn<() => { url: string; name: string; mimeType: string } | null>(),
  mutation: vi.fn().mockResolvedValue(1),
}))
vi.mock('convex/react', async (importOriginal) => ({
  ...(await importOriginal<typeof ConvexReact>()),
  useQuery: () => query(),
  useMutation: () => mutation,
}))
const widget = z.custom<Extract<Widget, { kind: 'image' }>>().parse({
  _id: 'image',
  _creationTime: 0,
  ownerId: 'owner',
  projectId: 'project',
  screenId: 'screen',
  updatedAt: 0,
  formatVersion: 2,
  version: 0,
  kind: 'image',
  config: { fileId: 'file', alt: 'Plan', fit: 'contain' },
  state: { zoom: 1, x: 0, y: 0 },
})

test('image renders with zoom, persists changes and handles unavailable files', async () => {
  query.mockReturnValue({ url: imageUrl, name: 'Plan', mimeType: 'image/png' })
  mutation.mockClear()
  const screen = await render(<FileWidget widget={widget} readOnly={false} />)
  await expect.element(screen.getByRole('img', { name: 'Plan' })).toBeVisible()
  await expect
    .poll(() => {
      const image = screen.getByRole('img', { name: 'Plan' }).element()
      return image instanceof HTMLImageElement ? image.naturalWidth : 0
    })
    .toBe(1)
  await screen.getByRole('slider', { name: 'Zoom image' }).fill('2')
  expect(mutation).toHaveBeenCalledWith({
    id: 'image',
    expectedVersion: 0,
    widget: {
      kind: 'image',
      config: widget.config,
      state: { zoom: 2, x: 0, y: 0 },
    },
  })
  await screen.rerender(
    <FileWidget
      widget={{ ...widget, version: 1, state: { zoom: 2, x: 0, y: 0 } }}
      readOnly
    />
  )
  await expect
    .element(screen.getByRole('img', { name: 'Plan' }))
    .toHaveStyle({ transform: 'translate(0px, 0px) scale(2)' })
  query.mockReturnValue(null)
  await screen.rerender(<FileWidget widget={widget} readOnly />)
  await expect.element(screen.getByText('Fichier indisponible')).toBeVisible()
})
function PdfFixture() {
  const [page, setPage] = useState(1)
  return <PdfView url={pdfUrl} page={page} onPage={setPage} />
}
test('real PDF worker renders two fixture pages, navigates and clamps out-of-range input', async () => {
  const screen = await render(<PdfFixture />)
  await expect.element(screen.getByText('Page 1 / 2')).toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'Page précédente' }))
    .toBeDisabled()
  await screen.getByRole('button', { name: 'Page suivante' }).click()
  await expect.element(screen.getByText('Page 2 / 2')).toBeVisible()
  await expect
    .element(screen.getByRole('button', { name: 'Page suivante' }))
    .toBeDisabled()
  await screen.getByRole('spinbutton', { name: 'Page PDF' }).fill('999')
  await expect.element(screen.getByText('Page 2 / 2')).toBeVisible()
  await screen.getByRole('spinbutton', { name: 'Page PDF' }).fill('-1')
  await expect.element(screen.getByText('Page 1 / 2')).toBeVisible()
})
