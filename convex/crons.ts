import { cronJobs } from 'convex/server'
import { internal } from './_generated/api'

const crons = cronJobs()
crons.daily(
  'Remove expired auth data and security events',
  { hourUTC: 3, minuteUTC: 0 },
  internal.cleanup.expiredData,
  {},
)
export default crons
