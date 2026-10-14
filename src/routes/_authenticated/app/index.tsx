import { appConfig } from '@shared/app-config'
import { createFileRoute } from '@tanstack/react-router'

import { ErrorState } from '@/components/page-state'
import { ResourceList } from '@/features/resources/resource-list'

export const Route = createFileRoute('/_authenticated/app/')({
  head: () => ({ meta: [{ title: `Mes ressources — ${appConfig.name}` }] }),
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
  component: ResourceList,
})
