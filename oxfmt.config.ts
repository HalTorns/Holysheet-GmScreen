import { defineConfig } from 'oxfmt'
import ultracite from 'ultracite/oxfmt'

export default defineConfig({
  ...ultracite,
  semi: false,
  singleQuote: true,
  sortTailwindcss: {
    functions: ['clsx', 'cva', 'twMerge', 'cn'],
    stylesheet: './src/styles.css',
  },
  ignorePatterns: [
    '**/_generated/**',
    'convex/betterAuth/generatedSchema.ts',
    'src/routeTree.gen.ts',
    '.output/**',
    'backups/**',
    'test-results/**',
    'playwright-report/**',
    'pnpm-lock.yaml',
  ],
})
