import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

import { createUIPlugins, sharedResolve } from './config/vite-shared.ts'

const [tailwindPlugin, reactPlugin] = createUIPlugins()

export default defineConfig({
  plugins: [tailwindPlugin, tanstackStart(), nitro(), reactPlugin],
  resolve: sharedResolve,
  ssr: { noExternal: ['@convex-dev/better-auth'] },
  build: { assetsInlineLimit: 0 },
  server: { port: 3000, strictPort: true, host: '127.0.0.1' },
})
