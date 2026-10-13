import { convexQuery } from '@convex-dev/react-query'
import { useSuspenseQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { api } from '@convex/_generated/api'
import { organizationRoleLabels } from '@shared/organizations'
import { ResourceList } from '@/features/resources/resource-list'
import { OrganizationMembers } from './organization-members'
import { OrganizationActions } from './organization-actions'

export function OrganizationPage({
  organizationId,
}: {
  organizationId: string
}) {
  const { data } = useSuspenseQuery(
    convexQuery(api.organizations.get, { organizationId }),
  )
  return (
    <>
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3 text-sm">
        <Link to="/app/organizations" className="text-primary underline">
          Toutes mes organisations
        </Link>
        <span>
          Votre rôle :{' '}
          <strong>{organizationRoleLabels[data.organization.role]}</strong>
        </span>
      </div>
      <ResourceList
        key={`${organizationId}-${data.organization.role}`}
        organization={data.organization}
      />
      <OrganizationMembers data={data} />
      <OrganizationActions organization={data.organization} />
    </>
  )
}
