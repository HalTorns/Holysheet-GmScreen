import { defineConfig } from 'vitest/config'

import { sharedResolve } from './config/vite-shared.ts'

export default defineConfig({
  resolve: sharedResolve,
  test: {
    // Bound concurrent compilation and component fixtures on local WSL machines.
    maxWorkers: 2,
    // Mesure C1 (3 passes, Node 26.11) : tests à fixtures auth 1 à 1,9 s, pics
    // de contention jusqu'à 3,8 s. Le défaut de 5 s échouait sans défaut réel ;
    // aucun retry, un échec reste un échec. Voir docs/AUDIT.md (AUD-07).
    testTimeout: 15_000,
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
