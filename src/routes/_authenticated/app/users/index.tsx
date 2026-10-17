import { createFileRoute } from '@tanstack/react-router'

import { AdminError, AdminUsers } from '@/features/admin/users'

export const Route = createFileRoute('/_authenticated/app/users/')({
  head: () => ({ meta: [{ title: 'Administration des utilisateurs' }] }),
  errorComponent: AdminError,
  component: AdminUsers,
})
