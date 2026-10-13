import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@convex': fileURLToPath(new URL('./convex', import.meta.url)),
      '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    },
  },
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
