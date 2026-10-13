import { useState } from 'react'
import { operationErrorMessage } from '@/features/auth/errors'

export function useOrganizationOperation() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function run(operation: () => Promise<unknown>) {
    setPending(true)
    setError(null)
    try {
      await operation()
      return true
    } catch (failure) {
      setError(operationErrorMessage(failure))
      return false
    } finally {
      setPending(false)
    }
  }
  return { pending, error, run }
}
