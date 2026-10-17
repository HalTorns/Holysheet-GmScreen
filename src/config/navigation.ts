import { linkOptions } from '@tanstack/react-router'
import { Building2, LayoutGrid, ShieldCheck, LifeBuoy } from 'lucide-react'

// Routes are checked against the generated route tree. These links describe
// navigation only; every private Convex function still enforces its own access.
export const appNavigation = linkOptions([
  {
    to: '/app',
    label: 'Ressources',
    icon: LayoutGrid,
    activeOptions: { exact: true },
  },
  {
    to: '/app/security',
    label: 'Compte',
    icon: ShieldCheck,
  },
])

export const organizationsNavigation = linkOptions({
  to: '/app/organizations',
  label: 'Organisations',
  icon: Building2,
})

export const supportNavigation = linkOptions({
  to: '/app/admin',
  label: 'Support',
  icon: LifeBuoy,
})

export const adminNavigation = linkOptions({
  to: '/app/users',
  label: 'Utilisateurs',
  icon: ShieldCheck,
})
