import { z } from 'zod'

const envelopeItem = z.object({ type: z.string() })
const exceptionEvent = z.object({
  event_id: z.string().regex(/^[a-f\d]{32}$/i),
  exception: z.object({
    values: z.array(z.object({ type: z.string() })).min(1),
  }),
})

// SDK envelopes have one header followed by item-header/payload pairs. Only
// an actual exception event proves error delivery; session reports do not.
export function containsExceptionEvent(body: string | null) {
  if (!body) return false
  const lines = body.split('\n')
  try {
    for (let index = 1; index + 1 < lines.length; index += 2) {
      const header = envelopeItem.safeParse(JSON.parse(lines[index] ?? ''))
      if (
        header.success &&
        header.data.type === 'event' &&
        exceptionEvent.safeParse(JSON.parse(lines[index + 1] ?? '')).success
      )
        return true
    }
  } catch {
    return false
  }
  return false
}
