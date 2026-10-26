import { defineConfig } from 'vitest/config'

import { sharedResolve } from './config/vite-shared.ts'

export default defineConfig({
  resolve: sharedResolve,
  test: {
    // Bound concurrent compilation and component fixtures on local WSL machines.
    maxWorkers: 2,
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
