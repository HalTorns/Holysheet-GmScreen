import { CatchBoundary } from '@tanstack/react-router'
import { makeFunctionReference } from 'convex/server'
import { useState } from 'react'
import { afterEach, expect, test, vi } from 'vitest'
import { render } from 'vitest-browser-react'

// Simule les souscriptions Convex : chaque réabonnement (retrait puis ajout de
// la query) consomme la réponse suivante du scénario.
const scenario = vi.hoisted(() => ({
  responses: [] as (string | Error | undefined)[],
  subscriptions: 0,
  subscribed: false,
}))
vi.mock('convex/react', () => ({
  useQueries: (request: Record<string, unknown>) => {
    if (!('value' in request)) {
      scenario.subscribed = false
      return {}
    }
    if (!scenario.subscribed) {
      scenario.subscribed = true
      scenario.subscriptions += 1
    }
    const index = Math.min(
      scenario.subscriptions - 1,
      scenario.responses.length - 1
    )
    return { value: scenario.responses[index] }
  },
}))

const { useResilientQuery } =
  await import('../../src/hooks/use-resilient-query')

// Comme `api.x.y`, une référence neuve à chaque rendu ne doit pas recréer la
// souscription (sinon boucle de rendus, React #301).
function Probe() {
  const value = useResilientQuery(
    makeFunctionReference<'query', { id: string }, string>('probe:get'),
    { id: 'a' }
  )
  const [draft, setDraft] = useState('')
  if (value === undefined) return <p>Chargement</p>
  return (
    <label>
      {value}
      <input value={draft} onChange={(event) => setDraft(event.target.value)} />
    </label>
  )
}

afterEach(() => {
  vi.useRealTimers()
  scenario.responses = []
  scenario.subscriptions = 0
  scenario.subscribed = false
})

test('a transient server error keeps the mounted editor and its draft, then resubscribes', async () => {
  scenario.responses = ['Version A']
  const screen = await render(<Probe />)
  await screen.getByRole('textbox').fill('brouillon')
  scenario.responses = ['Version A', new Error('Server Error'), 'Version B']
  // Une nouvelle réponse de la même souscription : l'erreur passagère.
  scenario.subscriptions = 2
  await screen.rerender(<Probe />)
  await expect.element(screen.getByText('Version A')).toBeVisible()
  await expect.element(screen.getByRole('textbox')).toHaveValue('brouillon')
  await expect
    .element(screen.getByText('Version B'), { timeout: 3000 })
    .toBeVisible()
  await expect.element(screen.getByRole('textbox')).toHaveValue('brouillon')
})

test('a persistent transient error stops after five resubscriptions', async () => {
  vi.useFakeTimers()
  scenario.responses = [new Error('Server Error')]
  const screen = await render(
    <CatchBoundary
      getResetKey={() => 'probe'}
      errorComponent={() => <p role="alert">Indisponible</p>}
    >
      <Probe />
    </CatchBoundary>
  )
  // Cinq réabonnements, puis abandon 2 s après le dernier ; aucun septième.
  for (let step = 0; step < 6; step += 1)
    await vi.advanceTimersByTimeAsync(500 * 2 ** step + 300)
  await vi.advanceTimersByTimeAsync(2100)
  expect(scenario.subscriptions).toBe(6)
  await expect.element(screen.getByRole('alert')).toBeVisible()
})

test('with a value on screen, exhausted retries never unmount the draft', async () => {
  vi.useFakeTimers()
  scenario.responses = ['Version A']
  const screen = await render(<Probe />)
  await screen.getByRole('textbox').fill('brouillon')
  scenario.responses = ['Version A', new Error('Server Error')]
  scenario.subscriptions = 2
  await screen.rerender(<Probe />)
  for (let step = 0; step < 5; step += 1)
    await vi.advanceTimersByTimeAsync(500 * 2 ** step + 300)
  await vi.advanceTimersByTimeAsync(31_000)
  await expect.element(screen.getByRole('textbox')).toHaveValue('brouillon')
  expect(scenario.subscriptions).toBeGreaterThanOrEqual(7)
  scenario.responses = [...scenario.responses, 'Version B']
  scenario.responses.length = scenario.subscriptions + 1
  scenario.responses.fill('Version B', scenario.subscriptions)
  await vi.advanceTimersByTimeAsync(31_000)
  await expect.element(screen.getByText('Version B')).toBeVisible()
  await expect.element(screen.getByRole('textbox')).toHaveValue('brouillon')
})
