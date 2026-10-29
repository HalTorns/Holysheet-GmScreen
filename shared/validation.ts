import { z } from './zod'

export const MAX_PAGE_SIZE = 50
export const RECENT_AUTH_MAX_AGE_SECONDS = 300

export const emailSchema = z
  .email('Saisissez une adresse email valide.')
  .max(254)
export const otpSchema = z
  .string()
  .regex(/^\d{6}$/, 'Saisissez le code à 6 chiffres.')

// Normalize before validating; lengths count Unicode code points, not UTF-16 units.
function normalizeDisplayName(value: string) {
  return value.normalize('NFKC').replaceAll(/\s+/gu, ' ').trim()
}
export function displayNameKey(value: string) {
  return normalizeDisplayName(value).toLowerCase()
}
function displayNameLength(value: string) {
  let length = 0
  for (const character of value) length += character ? 1 : 0
  return length
}
export const displayNameSchema = z
  .string()
  .max(256, 'Le pseudo est trop long.')
  .transform(normalizeDisplayName)
  .refine(
    (value) => displayNameLength(value) >= 2 && displayNameLength(value) <= 32,
    'Le pseudo doit contenir de 2 à 32 caractères.'
  )
  .refine(
    (value) => /^[\p{L}\p{M}\p{N} ._-]+$/u.test(value),
    'Utilisez des lettres, chiffres, espaces, points, tirets ou underscores.'
  )
