import type { KnipConfig } from 'knip'

export default {
  entry: ['src/routes/**/*.{ts,tsx}', 'scripts/*.mjs'],
  project: [
    'src/**/*.{ts,tsx,css}',
    'convex/**/*.ts',
    'shared/**/*.ts',
    'config/**/*.ts',
    'tests/**/*.{ts,tsx}',
    'scripts/*.mjs',
  ],
  vitest: {
    config: ['vitest*.config.ts'],
    entry: ['tests/**/*.test.{ts,tsx}'],
  },
  // Native macOS binary, checked before use.
  ignoreBinaries: ['pbcopy'],
  convex: { entry: ['convex/*.ts', 'convex/betterAuth/*.ts'] },
} satisfies KnipConfig
