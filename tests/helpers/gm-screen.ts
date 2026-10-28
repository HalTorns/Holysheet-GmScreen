import type { FunctionArgs, FunctionReturnType } from 'convex/server'

import { api } from '../../convex/_generated/api'
import type { Widget } from '../../convex/lib/gmFormats'

// Test-only aggregation: exercise all paginated metadata and individual payload APIs.
type Reader = {
  query: {
    (
      reference: typeof api.gm.getScreen,
      args: FunctionArgs<typeof api.gm.getScreen>
    ): Promise<FunctionReturnType<typeof api.gm.getScreen>>
    (
      reference: typeof api.gmWidgets.listScreenWidgets,
      args: FunctionArgs<typeof api.gmWidgets.listScreenWidgets>
    ): Promise<FunctionReturnType<typeof api.gmWidgets.listScreenWidgets>>
    (
      reference: typeof api.gmWidgets.getNoteContent,
      args: FunctionArgs<typeof api.gmWidgets.getNoteContent>
    ): Promise<FunctionReturnType<typeof api.gmWidgets.getNoteContent>>
  }
}
export async function readScreen(client: Reader, args: { id: string }) {
  const structure = await client.query(api.gm.getScreen, args)
  if (!structure) return null
  const notes: (Widget & { body: string })[] = []
  let cursor: string | null = null
  for (;;) {
    const result: FunctionReturnType<typeof api.gmWidgets.listScreenWidgets> =
      await client.query(api.gmWidgets.listScreenWidgets, {
        screenId: structure.screen._id,
        paginationOpts: { numItems: 10, cursor },
      })
    for (const widget of result.page)
      notes.push({
        ...widget,
        ...(await client.query(api.gmWidgets.getNoteContent, {
          id: widget._id,
        })),
      })
    if (result.isDone) break
    cursor = result.continueCursor
  }
  return { ...structure, notes }
}
