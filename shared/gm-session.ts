export type InitiativeEntry = {
  id: string
  name: string
  score: number
  note: string
}
type InitiativeState = {
  entries: InitiativeEntry[]
  currentId?: string
  round: number
}
export function initiativeOrder(entries: InitiativeEntry[]) {
  return [...entries].sort((left, right) => right.score - left.score)
}
export function advanceInitiative(state: InitiativeState): InitiativeState {
  const entries = initiativeOrder(state.entries)
  if (!entries.length) return state
  const index = entries.findIndex((entry) => entry.id === state.currentId)
  const following = entries[(index + 1) % entries.length]
  if (!following) return state
  return {
    ...state,
    currentId: following.id,
    round: state.round + (index === entries.length - 1 ? 1 : 0),
  }
}
export function removeInitiative(
  state: InitiativeState,
  id: string
): InitiativeState {
  const entries = state.entries.filter((entry) => entry.id !== id)
  const { currentId: _current, ...rest } = state
  if (!entries.length) return { ...rest, entries }
  if (state.currentId !== id) return { ...state, entries }
  const order = initiativeOrder(state.entries)
  const following =
    order[(order.findIndex((entry) => entry.id === id) + 1) % order.length]
  return following
    ? { ...state, entries, currentId: following.id }
    : { ...rest, entries }
}
export function clockElapsed(
  state: { running: boolean; startedAt?: number; elapsedMs: number },
  now: number
) {
  return (
    state.elapsedMs +
    (state.running && state.startedAt !== undefined
      ? Math.max(0, now - state.startedAt)
      : 0)
  )
}
export function formatClock(milliseconds: number) {
  const seconds = Math.floor(Math.max(0, milliseconds) / 1000)
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor(seconds / 60) % 60
  const tail = `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  return hours ? `${hours}:${tail}` : tail
}
