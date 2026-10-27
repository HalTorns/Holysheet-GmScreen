import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import { nitro } from 'nitro/vite'
import { defineConfig } from 'vite'

import { createUIPlugins, sharedResolve } from './config/vite-shared.ts'

const [tailwindPlugin, reactPlugin] = createUIPlugins()

export default defineConfig(async ({ command }) => {
  // Production builds must not evaluate development services or LOCAL_* ports.
  const localServer =
    command === 'serve'
      ? {
          port: Number(
            new URL((await import('./scripts/local-config.mjs')).siteUrl)
              .port || 80
          ),
          strictPort: true,
          host: '127.0.0.1',
        }
      : undefined
  return {
    plugins: [tailwindPlugin, tanstackStart(), nitro(), reactPlugin],
    resolve: sharedResolve,
    ssr: { noExternal: ['@convex-dev/better-auth'] },
    build: { assetsInlineLimit: 0 },
    ...(localServer ? { server: localServer, preview: localServer } : {}),
  }
})
