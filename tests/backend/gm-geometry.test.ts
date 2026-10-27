import { expect, it } from 'vitest'

import {
  arrangeWidgets,
  moveWidgets,
  withoutGroup,
} from '../../shared/gm-geometry'

const a = {
  noteId: 'a',
  x: 10,
  y: 20,
  width: 160,
  height: 120,
  groupId: 'team',
}
const b = {
  noteId: 'b',
  x: 220,
  y: 150,
  width: 160,
  height: 120,
  groupId: 'team',
}
const c = { noteId: 'c', x: 800, y: 400, width: 200, height: 200 }
it('clamps a whole group at either boundary without changing relative coordinates or unrelated widgets', () => {
  const moved = moveWidgets([a, b, c], 'a', -100, -100)
  expect(moved.map((p) => [p.x, p.y])).toEqual([
    [0, 0],
    [210, 130],
    [800, 400],
  ])
  const far = moveWidgets([a, b, c], 'a', 20_000, 20_000)
  expect(far[1]).toMatchObject({ x: 16_384, y: 16_384 })
  expect((far[1]?.x ?? 0) - (far[0]?.x ?? 0)).toBe(210)
})
it('aligns groups as blocks and distributes independent rectangles with equal clear gaps', () => {
  const aligned = arrangeWidgets([a, b, c], ['a', 'c'], 'left')
  expect(aligned.map((p) => p.x)).toEqual([10, 220, 10])
  const middle = { ...c, noteId: 'middle', x: 400, width: 100 }
  const distributed = arrangeWidgets(
    [withoutGroup(a), middle, c],
    ['a', 'middle', 'c'],
    'horizontal'
  )
  expect(distributed.map((p) => p.x)).toEqual([10, 435, 800])
  expect(arrangeWidgets([a, b, c], ['a', 'b'], 'horizontal')).toEqual([a, b, c])
})
it('keeps a restored ungrouped note separate from the group originally named after its ID', () => {
  const restored = { ...c, noteId: 'team' }
  const aligned = arrangeWidgets([a, b, restored], ['a', 'team'], 'left')
  expect(aligned.map((p) => p.x)).toEqual([10, 220, 10])
})
