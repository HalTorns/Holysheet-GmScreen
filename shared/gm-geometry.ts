type Rectangle = {
  noteId: string
  x: number
  y: number
  width: number
  height: number
  groupId?: string
}
export function withoutGroup<T extends { groupId?: string }>(
  value: T
): Omit<T, 'groupId'> {
  const { groupId: _groupId, ...rest } = value
  return rest
}
export function moveWidgets<T extends Rectangle>(
  placements: T[],
  id: string,
  dx: number,
  dy: number
): T[] {
  const active = placements.find((p) => p.noteId === id)
  if (!active) return placements
  const members = placements.filter(
    (p) => p.noteId === id || (active.groupId && p.groupId === active.groupId)
  )
  const x = Math.max(
    -Math.min(...members.map((p) => p.x)),
    Math.min(16_384 - Math.max(...members.map((p) => p.x)), Math.round(dx))
  )
  const y = Math.max(
    -Math.min(...members.map((p) => p.y)),
    Math.min(16_384 - Math.max(...members.map((p) => p.y)), Math.round(dy))
  )
  const ids = new Set(members.map((p) => p.noteId))
  return placements.map((p) =>
    ids.has(p.noteId) ? { ...p, x: p.x + x, y: p.y + y } : p
  )
}

export type Arrangement =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'horizontal'
  | 'vertical'
// Groups are alignment units: their internal relative coordinates are preserved.
export function arrangeWidgets<T extends Rectangle>(
  placements: T[],
  selected: string[],
  kind: Arrangement
): T[] {
  const ids = new Set(selected)
  const keys = new Set(
    placements
      .filter((p) => ids.has(p.noteId))
      .map((p) => (p.groupId ? `group:${p.groupId}` : `note:${p.noteId}`))
  )
  const units = [...keys].map((key) => {
    const members = placements.filter(
      (p) => (p.groupId ? `group:${p.groupId}` : `note:${p.noteId}`) === key
    )
    const x = Math.min(...members.map((p) => p.x))
    const y = Math.min(...members.map((p) => p.y))
    return {
      members,
      x,
      y,
      right: Math.max(...members.map((p) => p.x + p.width)),
      bottom: Math.max(...members.map((p) => p.y + p.height)),
    }
  })
  if (units.length < 2) return placements
  const horizontal = kind === 'horizontal'
  const distribution = horizontal || kind === 'vertical'
  if (distribution && units.length < 3) return placements
  const sorted = [...units].sort((a, b) => (horizontal ? a.x - b.x : a.y - b.y))
  const first = sorted[0]
  const last = sorted.at(-1)
  if (!first || !last) return placements
  const extent = horizontal ? last.right - first.x : last.bottom - first.y
  const gap =
    (extent -
      sorted.reduce(
        (sum, u) => sum + (horizontal ? u.right - u.x : u.bottom - u.y),
        0
      )) /
    (units.length - 1)
  if (distribution && gap < 0) return placements
  let cursor = horizontal ? first.x : first.y
  const changes = new Map<string, { x: number; y: number }>()
  for (const unit of distribution ? sorted : units) {
    let dx = 0
    let dy = 0
    if (kind === 'left') dx = Math.min(...units.map((u) => u.x)) - unit.x
    if (kind === 'right')
      dx = Math.max(...units.map((u) => u.right)) - unit.right
    if (kind === 'top') dy = Math.min(...units.map((u) => u.y)) - unit.y
    if (kind === 'bottom')
      dy = Math.max(...units.map((u) => u.bottom)) - unit.bottom
    if (distribution) {
      if (horizontal) dx = Math.round(cursor) - unit.x
      else dy = Math.round(cursor) - unit.y
      cursor += (horizontal ? unit.right - unit.x : unit.bottom - unit.y) + gap
    }
    dx = Math.max(
      -Math.min(...unit.members.map((p) => p.x)),
      Math.min(16_384 - Math.max(...unit.members.map((p) => p.x)), dx)
    )
    dy = Math.max(
      -Math.min(...unit.members.map((p) => p.y)),
      Math.min(16_384 - Math.max(...unit.members.map((p) => p.y)), dy)
    )
    for (const member of unit.members)
      changes.set(member.noteId, { x: member.x + dx, y: member.y + dy })
  }
  return placements.map((p) =>
    changes.has(p.noteId) ? { ...p, ...changes.get(p.noteId) } : p
  )
}
