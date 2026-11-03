import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

import { sharedResolve, createUIPlugins } from './config/vite-shared.ts'

export default defineConfig({
  // Browser component fixtures use stable public origins, independent of local
  // deployment settings, including the embed widget's same-origin refusal.
  define: {
    'import.meta.env.VITE_SITE_URL': JSON.stringify('https://app.example.com'),
    'import.meta.env.VITE_CONVEX_URL': JSON.stringify(
      'https://cloud.example.com'
    ),
    'import.meta.env.VITE_CONVEX_SITE_URL': JSON.stringify(
      'https://site.example.com'
    ),
  },
  optimizeDeps: {
    include: [
      'convex/values',
      '@t3-oss/env-core',
      '@base-ui/react/context-menu',
      '@base-ui/react/menu',
    ],
  },
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
