import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

import { createUIPlugins, sharedResolve } from './config/vite-shared.ts'
import { siteUrl } from './scripts/local-config.mjs'

const [tailwindPlugin, reactPlugin] = createUIPlugins()

export default defineConfig({
  plugins: [tailwindPlugin, tanstackStart(), nitro(), reactPlugin],
  resolve: sharedResolve,
  ssr: { noExternal: ['@convex-dev/better-auth'] },
  build: { assetsInlineLimit: 0 },
  server: {
    port: Number(new URL(siteUrl).port || 80),
    strictPort: true,
    host: '127.0.0.1',
  },
  preview: {
    port: Number(new URL(siteUrl).port || 80),
    strictPort: true,
    host: '127.0.0.1',
  },
})
