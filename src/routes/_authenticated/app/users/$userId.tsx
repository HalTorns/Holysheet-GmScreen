import { createFileRoute } from '@tanstack/react-router'

import { AdminUser } from '@/features/admin/user-detail'
import { AdminError } from '@/features/admin/users'

export const Route = createFileRoute('/_authenticated/app/users/$userId')({
  head: () => ({ meta: [{ title: 'Fiche utilisateur' }] }),
  errorComponent: AdminError,
  component: UserPage,
})
function UserPage() {
  const { userId } = Route.useParams()
  return <AdminUser userId={userId} />
}
