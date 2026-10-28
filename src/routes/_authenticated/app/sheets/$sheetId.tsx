import { createFileRoute } from '@tanstack/react-router'

import { ErrorState } from '@/components/page-state'
import { Sheet } from '@/features/gm/sheet'

export const Route = createFileRoute('/_authenticated/app/sheets/$sheetId')({
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
  component: SheetPage,
})
function SheetPage() {
  const { sheetId } = Route.useParams()
  return <Sheet key={sheetId} sheetId={sheetId} />
}
