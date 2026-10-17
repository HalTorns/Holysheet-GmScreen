import { Button } from '@/components/ui/button'

export function ListNavigation({
  page,
  pending,
  previous,
  next,
}: {
  page: number
  pending: boolean
  previous?: () => void
  next?: () => void
}) {
  return (
    <nav
      aria-label="Pagination"
      className="my-4 flex flex-wrap items-center justify-between gap-3"
    >
      <Button
        variant="outline"
        disabled={pending || !previous}
        onClick={previous}
      >
        Précédent
      </Button>
      <span role="status" aria-live="polite">
        {pending ? 'Chargement…' : `Page ${page}`}
      </span>
      <Button variant="outline" disabled={pending || !next} onClick={next}>
        Suivant
      </Button>
    </nav>
  )
}
