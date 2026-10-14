import { spawnSync } from 'node:child_process'

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'auth',
    'generate',
    '--config',
    'convex/betterAuth/auth.ts',
    '--output',
    'convex/betterAuth/generatedSchema.ts',
    '--yes',
  ],
  { stdio: 'inherit' }
)
process.exit(result.status ?? 1)
