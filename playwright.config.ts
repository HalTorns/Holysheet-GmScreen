import { defineConfig, devices } from '@playwright/test'

import { siteUrl } from './scripts/local-config.mjs'

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? siteUrl
const port = new URL(baseURL).port || '80'
const production =
  !process.env.PLAYWRIGHT_DEVELOPMENT &&
  Boolean(process.env.CI || process.env.PLAYWRIGHT_PRODUCTION)
// The pinned core patch also applies this flag to matcher-level ARIA snapshots.
process.env.PLAYWRIGHT_NO_COPY_PROMPT = '1'

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: 'list',
  forbidOnly: Boolean(process.env.CI),
  use: {
    baseURL,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: production ? 'pnpm start' : `pnpm dev --port ${port}`,
    env: { PORT: port, HOST: '127.0.0.1' },
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
  },
})
