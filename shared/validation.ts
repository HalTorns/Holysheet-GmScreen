import { z } from './zod'

export const RESOURCE_TITLE_MAX_LENGTH = 120
export const RESOURCE_DESCRIPTION_MAX_LENGTH = 4_000
export const MAX_PAGE_SIZE = 50
export const RECENT_AUTH_MAX_AGE_SECONDS = 300

export const resourceSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, 'Un titre est requis.')
      .max(RESOURCE_TITLE_MAX_LENGTH),
    description: z.string().trim().max(RESOURCE_DESCRIPTION_MAX_LENGTH),
  })
  .strict()

export const emailSchema = z
  .email('Saisissez une adresse email valide.')
  .max(254)
export const otpSchema = z
  .string()
  .regex(/^\d{6}$/, 'Saisissez le code à 6 chiffres.')

export type ResourceInput = z.infer<typeof resourceSchema>
