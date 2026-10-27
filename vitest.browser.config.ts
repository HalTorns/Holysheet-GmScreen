import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

import { sharedResolve, createUIPlugins } from './config/vite-shared.ts'

export default defineConfig({
  optimizeDeps: { include: ['convex/values'] },
  resolve: sharedResolve,
  plugins: [...createUIPlugins()],
  test: {
    include: ['tests/browser/**/*.test.tsx'],
    browser: {
      enabled: true,
      headless: true,
      provider: playwright(),
      instances: [{ browser: 'chromium' }],
      screenshotFailures: false,
    },
  },
})
