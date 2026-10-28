import { createFileRoute } from '@tanstack/react-router'

import { ErrorState } from '@/components/page-state'
import { Library } from '@/features/gm/library'

export const Route = createFileRoute(
  '/_authenticated/app/projects/$projectId_/library'
)({
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
  component: LibraryPage,
})
function LibraryPage() {
  const { projectId } = Route.useParams()
  return <Library key={projectId} projectId={projectId} />
}
