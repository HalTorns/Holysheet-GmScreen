import type { ComponentProps } from 'react'

import { DialogContent } from '@/components/ui/dialog'
import { AuthConnectionNotice } from '@/lib/auth-provider'

// Keep the retry inside the modal's focus/inert boundary so an open form can
// recover from an auth transport outage without closing or losing its draft.
export function FormDialogContent({
  children,
  ...props
}: ComponentProps<typeof DialogContent>) {
  return (
    <DialogContent {...props}>
      <AuthConnectionNotice inDialog />
      {children}
    </DialogContent>
  )
}
