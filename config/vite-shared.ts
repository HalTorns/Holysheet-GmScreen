import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export const sharedResolve = {
  dedupe: ['react', 'react-dom'],
  alias: {
    '@': fileURLToPath(new URL('../src', import.meta.url)),
    '@convex': fileURLToPath(new URL('../convex', import.meta.url)),
    '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
  },
}

export function createUIPlugins() {
  return [tailwindcss(), react()] as const
}
