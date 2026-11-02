import type { Id } from '@convex/_generated/dataModel'
import { z } from '@shared/zod'
import { useRef, useState } from 'react'

import { env } from '@/env'
import { useConvexAccessToken } from '@/lib/auth-provider'

const resultSchema = z.object({
  id: z.custom<Id<'gmFiles'>>(
    (value) => typeof value === 'string' && value.length > 0
  ),
  mimeType: z.string(),
})
const messages: Record<string, string> = {
  FILE_TOO_LARGE: 'Fichier trop volumineux (10 Mio par image, 16 Mio par PDF).',
  FILE_TYPE: 'Type refusé : PNG, JPEG, WebP, GIF ou PDF uniquement.',
  STORAGE_QUOTA: 'Quota de stockage atteint (500 Mio).',
  PROJECT_FILE_LIMIT: 'Limite de 200 fichiers par projet atteinte.',
  RATE_LIMITED: 'Trop d’imports. Réessayez dans un instant.',
  UNAUTHENTICATED: 'Session expirée. Reconnectez-vous.',
  MFA_REQUIRED: 'Validez votre second facteur.',
}
export function useFileUpload(projectId: Id<'gmProjects'>) {
  const getToken = useConvexAccessToken()
  const busy = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  async function upload(file: File) {
    if (busy.current) throw new Error('Un import est déjà en cours.')
    busy.current = true
    setPending(true)
    setError(null)
    try {
      const token = await getToken()
      const url = new URL('/files/upload', env.VITE_CONVEX_SITE_URL)
      url.searchParams.set('projectId', projectId)
      url.searchParams.set('name', file.name)
      const response = await fetch(url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: file,
      })
      const payload: unknown = await response.json()
      if (!response.ok) {
        const failure = z.object({ code: z.string() }).safeParse(payload)
        throw new Error(
          failure.success
            ? (messages[failure.data.code] ?? 'Import refusé.')
            : 'Import indisponible.'
        )
      }
      return resultSchema.parse(payload)
    } catch (error_) {
      setError(
        error_ instanceof Error ? error_.message : 'Import indisponible.'
      )
      throw error_
    } finally {
      busy.current = false
      setPending(false)
    }
  }
  return { upload, pending, error }
}
