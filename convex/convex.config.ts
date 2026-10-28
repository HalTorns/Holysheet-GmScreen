import migrations from '@convex-dev/migrations/convex.config'
import rateLimiter from '@convex-dev/rate-limiter/convex.config'
import { defineApp } from 'convex/server'

import betterAuth from './betterAuth/convex.config'

const app = defineApp()
app.use(betterAuth)
app.use(rateLimiter)
app.use(migrations)
export default app
