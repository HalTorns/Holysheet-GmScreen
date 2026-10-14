import { defineConfig } from 'vitest/config'

import { sharedResolve } from './config/vite-shared.ts'

export default defineConfig({
  resolve: sharedResolve,
  test: {
    include: [
      'tests/backend/**/*.test.ts',
      'tests/unit/**/*.test.ts',
      'tests/scripts/**/*.test.ts',
    ],
    environment: 'edge-runtime',
    server: { deps: { inline: ['convex-test'] } },
    restoreMocks: true,
  },
})
