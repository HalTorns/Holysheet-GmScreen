import { z } from 'zod'

// The default JIT probe uses new Function, which a strict browser CSP blocks.
z.config({ jitless: true })

export { z }
