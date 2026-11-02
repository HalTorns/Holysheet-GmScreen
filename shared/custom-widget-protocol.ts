import { z } from './zod.ts'

function boundedJson(value: unknown, bytes: number, depth = 8): boolean {
  let nodes = 0
  function valid(entry: unknown, level: number): boolean {
    if (++nodes > 2048 || level > depth) return false
    if (
      entry === null ||
      typeof entry === 'boolean' ||
      typeof entry === 'string'
    )
      return true
    if (typeof entry === 'number') return Number.isFinite(entry)
    if (Array.isArray(entry))
      return entry.every((item: unknown) => valid(item, level + 1))
    if (
      typeof entry !== 'object' ||
      Object.getPrototypeOf(entry) !== Object.prototype
    )
      return false
    return Object.values(entry).every((item: unknown) => valid(item, level + 1))
  }
  try {
    return (
      valid(value, 0) &&
      new TextEncoder().encode(JSON.stringify(value)).length <= bytes
    )
  } catch {
    return false
  }
}
export type CustomJson =
  | null
  | boolean
  | number
  | string
  | CustomJson[]
  | { [key: string]: CustomJson }
export const customState = z.custom<CustomJson>((value) =>
  boundedJson(value, 8192)
)
const scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])
export const customSettings = z
  .record(z.string().max(80), z.union([scalar, z.array(scalar)]))
  .refine((value) => boundedJson(value, 4096, 2))
const source = z
  .string()
  .refine((value) => new TextEncoder().encode(value).length <= 65_536)
export const customDefinition = z
  .object({
    name: z.string().trim().min(1).max(120),
    html: source,
    css: source,
    source,
    compiled: source,
    language: z.enum(['js', 'ts']),
  })
  .strict()
  .refine(
    (value) => new TextEncoder().encode(JSON.stringify(value)).length <= 262_144
  )
export const customInit = z
  .object({
    type: z.literal('init'),
    html: source,
    css: source,
    js: source,
    settings: customSettings,
    state: customState,
    mode: z.enum(['live', 'static', 'preview']),
    theme: z.enum(['light', 'dark']),
  })
  .strict()
export const customUpdate = z
  .object({
    type: z.literal('update'),
    settings: customSettings,
    state: customState,
  })
  .strict()
export const customOutput = z.discriminatedUnion('type', [
  z.object({ type: z.literal('ready') }).strict(),
  z.object({ type: z.literal('pong') }).strict(),
  z.object({ type: z.literal('setState'), state: customState }).strict(),
  z
    .object({
      type: z.literal('resize'),
      height: z.number().int().min(0).max(4096),
    })
    .strict(),
  z.object({ type: z.literal('error'), message: z.string().max(500) }).strict(),
  z.object({ type: z.literal('suspended') }).strict(),
])
export function messageBudget() {
  let start = 0
  let total = 0
  const counts = new Map<string, number>()
  return (type: string, now = Date.now()) => {
    if (now - start >= 1000) {
      start = now
      total = 0
      counts.clear()
    }
    const count = (counts.get(type) ?? 0) + 1
    counts.set(type, count)
    return (
      ++total <= 30 &&
      count <=
        (type === 'setState'
          ? 10
          : type === 'resize' || type === 'error'
            ? 5
            : 30)
    )
  }
}
