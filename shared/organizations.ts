import { z } from './zod'

export const organizationRoles = ['owner', 'admin', 'member', 'viewer'] as const
export type OrganizationRole = (typeof organizationRoles)[number]
export const organizationRoleSchema = z.enum(organizationRoles)
export const organizationRoleLabels: Record<OrganizationRole, string> = {
  owner: 'Propriétaire',
  admin: 'Administrateur',
  member: 'Membre',
  viewer: 'Lecteur',
}
export const organizationSchema = z.object({
  name: z.string().trim().min(2).max(80),
})
export const MAX_ORGANIZATIONS_PER_USER = 20
export const MAX_ORGANIZATION_MEMBERS = 100
export const MAX_PENDING_INVITATIONS = 100
export const MAX_RECIPIENT_INVITATIONS = 10
export const INVITATION_DURATION_MS = 7 * 24 * 60 * 60 * 1_000

export function canWriteOrganizationResources(role: OrganizationRole) {
  return role !== 'viewer'
}

export function canManageOrganizationMembers(role: OrganizationRole) {
  return role === 'owner' || role === 'admin'
}
