import { appConfig } from '@shared/app-config'
import { createFileRoute } from '@tanstack/react-router'

import { ErrorState } from '@/components/page-state'
import { Projects } from '@/features/gm/projects'

export const Route = createFileRoute('/_authenticated/app/')({
  head: () => ({ meta: [{ title: `Mes projets — ${appConfig.name}` }] }),
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
  component: Projects,
})
