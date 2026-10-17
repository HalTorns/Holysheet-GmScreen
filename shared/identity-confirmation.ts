import { z } from './zod'

export const identityOperationSchema = z.union([
  z.enum([
    'account.delete',
    'passkey.add',
    'mfa.enable',
    'mfa.disable',
    'mfa.uri',
    'mfa.backup-codes',
  ]),
  z
    .string()
    .regex(/^(?:passkey\.remove|organization\.delete):[a-zA-Z0-9_-]{1,128}$/),
])
