import { z } from '../../shared/zod'

// Private deployment policy. Public responses only describe the resulting UX.
export function getProfilePolicy() {
  const read = (value: string | undefined) =>
    z.enum(['true', 'false']).default('true').parse(value) === 'true'
  return {
    required: read(process.env.PROFILE_NAME_REQUIRED),
    unique: read(process.env.PROFILE_NAME_UNIQUE),
  }
}
