import { createFileRoute } from '@tanstack/react-router'

import { ErrorState } from '@/components/page-state'
import { Screen } from '@/features/gm/screen'

export const Route = createFileRoute('/_authenticated/app/screens/$screenId')({
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
  component: ScreenPage,
})
function ScreenPage() {
  const { screenId } = Route.useParams()
  return <Screen key={screenId} screenId={screenId} />
}
