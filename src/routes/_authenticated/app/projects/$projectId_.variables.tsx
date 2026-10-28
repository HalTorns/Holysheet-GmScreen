import { createFileRoute } from '@tanstack/react-router'

import { ErrorState } from '@/components/page-state'
import { Variables } from '@/features/gm/variables'

export const Route = createFileRoute(
  '/_authenticated/app/projects/$projectId_/variables'
)({
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
  component: VariablesPage,
})
function VariablesPage() {
  const { projectId } = Route.useParams()
  return <Variables key={projectId} projectId={projectId} />
}
