import { api } from '@convex/_generated/api'
import { createFileRoute, redirect } from '@tanstack/react-router'

import { ErrorState, LoadingState } from '@/components/page-state'
import { OrganizationPage } from '@/features/organizations/organization-page'
import { ensureConvexQuery } from '@/lib/convex-query'

export const Route = createFileRoute(
  '/_authenticated/app/organizations/$organizationId'
)({
  loader: async ({ context, params }) => {
    const capabilities = await ensureConvexQuery(
      context.queryClient,
      api.capabilities.get,
      {}
    )
    if (!capabilities.organizations) throw redirect({ to: '/app' })
    const data = await ensureConvexQuery(
      context.queryClient,
      api.organizations.get,
      { organizationId: params.organizationId }
    )
    return { name: data.organization.name }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: loaderData?.name ?? 'Organisation' }],
  }),
  pendingComponent: LoadingState,
  errorComponent: ({ reset }) => <ErrorState onRetry={reset} />,
  component: OrganizationRoute,
})

function OrganizationRoute() {
  const { organizationId } = Route.useParams()
  return <OrganizationPage organizationId={organizationId} />
}
