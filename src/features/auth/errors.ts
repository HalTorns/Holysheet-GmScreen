import { ConvexError } from 'convex/values'

const messages: Record<string, string> = {
  MODULE_DISABLED:
    'Le mode organisations est désactivé pour cette application.',
  FORBIDDEN: 'Votre rôle ne permet pas cette action.',
  LAST_OWNER:
    'Conservez un propriétaire : transférez ce rôle à un autre membre, ou supprimez l’organisation avant de partir.',
  INVITATION_EXPIRED:
    'Cette invitation est expirée, révoquée ou a déjà été utilisée.',
  ALREADY_INVITED: 'Une invitation est déjà en attente pour cette adresse.',
  ALREADY_MEMBER:
    'Cette personne est déjà membre. Modifiez son rôle depuis la liste des membres.',
  INVITATION_LIMIT: 'La limite des invitations en attente est atteinte.',
  ORGANIZATION_LIMIT: 'La limite de 20 organisations par compte est atteinte.',
  MEMBER_LIMIT: 'La limite de 100 membres par organisation est atteinte.',
  UNAUTHENTICATED: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  REAUTHENTICATION_REQUIRED:
    'Cette action demande une connexion récente. Reconnectez-vous, puis réessayez.',
  LAST_PASSKEY: 'Ajoutez une autre passkey avant de supprimer celle-ci.',
  RATE_LIMITED: 'Trop de tentatives. Patientez un moment avant de réessayer.',
  TOO_MANY_REQUESTS:
    'Trop de tentatives. Patientez un moment avant de réessayer.',
  OTP_EXPIRED: 'Ce code a expiré. Demandez un nouveau code.',
  INVALID_OTP:
    'Ce code est incorrect ou a expiré. Vérifiez-le ou demandez un nouveau code.',
  OTP_NOT_FOUND: 'Ce code est incorrect ou a expiré. Demandez un nouveau code.',
  INVALID_INPUT: 'Vérifiez les informations saisies et réessayez.',
  NOT_FOUND: 'Cet élément est introuvable ou vous n’y avez plus accès.',
  SESSION_EXPIRED: 'Votre session a expiré. Reconnectez-vous pour continuer.',
  SESSION_NOT_FRESH:
    'Cette action demande une connexion récente. Reconnectez-vous, puis réessayez.',
  PASSKEY_USER_VERIFICATION_REQUIRED:
    'Confirmez votre identité avec votre empreinte, votre visage ou le code PIN de votre appareil, puis réessayez.',
}

export function authErrorMessage(
  code: string | undefined,
  fallback = 'L’opération a échoué. Réessayez dans un instant.'
): string {
  return code ? (messages[code] ?? fallback) : fallback
}

export function operationErrorMessage(
  error: unknown,
  fallback?: string
): string {
  if (error instanceof AuthOperationError)
    return authErrorMessage(error.code, fallback)
  if (error instanceof ConvexError) {
    const data: unknown = error.data
    if (
      data &&
      typeof data === 'object' &&
      'code' in data &&
      typeof data.code === 'string'
    ) {
      return authErrorMessage(data.code, fallback)
    }
  }
  return (
    fallback ??
    'L’opération a échoué. Vérifiez votre connexion, puis réessayez.'
  )
}

export class AuthOperationError extends Error {
  constructor(readonly code: string | undefined) {
    super('Authentication operation failed')
    this.name = 'AuthOperationError'
  }
}

export function authOperationError(error: unknown): AuthOperationError {
  const code =
    error &&
    typeof error === 'object' &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : undefined
  return new AuthOperationError(code)
}
