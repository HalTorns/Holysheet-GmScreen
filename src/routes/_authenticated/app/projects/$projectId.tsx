import { createFileRoute } from '@tanstack/react-router'

import { ErrorState } from '@/components/page-state'
import { Project } from '@/features/gm/project'

export const Route = createFileRoute('/_authenticated/app/projects/$projectId')(
  {
    errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
    component: ProjectPage,
  }
)
function ProjectPage() {
  const { projectId } = Route.useParams()
  return <Project key={projectId} projectId={projectId} />
}
