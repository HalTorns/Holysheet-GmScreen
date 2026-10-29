import { api } from '@convex/_generated/api'
import type { Id } from '@convex/_generated/dataModel'
import type { Layout, Widget } from '@convex/lib/gmFormats'
import { usePaginatedQuery } from 'convex/react'
import { useEffect, useMemo, useState } from 'react'

type Page = { results: Widget[]; exhausted: boolean }

// AUD-28. La pagination temps réel de Convex reconstruit la liste page par
// page : elle la tronque dès qu'une page repasse à undefined (rafraîchissement
// d'authentification), et une page réactive garde ses bornes, si bien qu'un
// widget inséré après la dernière page peut ne jamais y apparaître. Les
// placements des profils, lus par une query simple, font foi : on garde le
// dernier état connu de chaque widget placé, et on relance la pagination
// quand un widget placé reste absent alors que toutes les pages sont lues.
export function useScreenWidgets(screenId: Id<'gmScreens'>, layouts: Layout[]) {
  const [generation, setGeneration] = useState(0)
  const [page, setPage] = useState<Page>({ results: [], exhausted: false })
  const [known, setKnown] = useState(() => new Map<Id<'gmNotes'>, Widget>())
  const placed = useMemo(
    () =>
      new Set(
        layouts.flatMap((layout) =>
          layout.placements.map((placement) => placement.widgetId)
        )
      ),
    [layouts]
  )
  const [seen, setSeen] = useState(page.results)
  if (seen !== page.results) {
    setSeen(page.results)
    if (page.results.length) {
      const next = new Map(known)
      for (const widget of page.results) next.set(widget._id, widget)
      for (const id of next.keys()) if (!placed.has(id)) next.delete(id)
      setKnown(next)
    }
  }
  const loaded = new Set(page.results.map((widget) => widget._id))
  const missing = page.exhausted
    ? [...placed].filter((id) => !loaded.has(id)).join(',')
    : ''
  // Une seule relance par ensemble manquant : une référence orpheline ne doit
  // pas relancer la pagination en boucle.
  const [retried, setRetried] = useState('')
  useEffect(() => {
    if (!missing || missing === retried) return undefined
    const timer = setTimeout(() => {
      setRetried(missing)
      setGeneration((value) => value + 1)
    }, 1500)
    return () => clearTimeout(timer)
  }, [missing, retried])
  const widgets = useMemo(
    () => [...known.values()].filter((widget) => placed.has(widget._id)),
    [known, placed]
  )
  const pages = (
    <WidgetPages key={generation} screenId={screenId} onPage={setPage} />
  )
  return { widgets, pages }
}

function WidgetPages({
  screenId,
  onPage,
}: {
  screenId: Id<'gmScreens'>
  onPage: (page: Page) => void
}) {
  const { results, status, loadMore } = usePaginatedQuery(
    api.gmWidgets.listScreenWidgets,
    { screenId },
    { initialNumItems: 10 }
  )
  useEffect(() => {
    if (status === 'CanLoadMore') loadMore(10)
  }, [status, loadMore])
  useEffect(() => {
    onPage({ results, exhausted: status === 'Exhausted' })
  }, [results, status, onPage])
  return null
}
