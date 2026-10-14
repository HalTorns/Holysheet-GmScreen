import { defineConfig } from 'oxlint'
import core from 'ultracite/oxlint/core'
import react from 'ultracite/oxlint/react'

export default defineConfig({
  extends: [core, react],
  options: { typeAware: true },
  ignorePatterns: [
    ...(core.ignorePatterns ?? []),
    '**/_generated/**',
    'convex/betterAuth/generatedSchema.ts',
    'src/routeTree.gen.ts',
    '.output/**',
    'backups/**',
    'test-results/**',
    'playwright-report/**',
  ],
  rules: {
    // Preserve the repository's readable conventions; formatting belongs to Oxfmt.
    'sort-keys': 'off',
    'no-shadow': 'off',
    'typescript/prefer-nullish-coalescing': 'off',
    'no-loop-func': 'off',
    'typescript/use-unknown-in-catch-callback-variable': 'off',
    'prefer-destructuring': 'off',
    'no-plusplus': 'off',
    'no-nested-ternary': 'off',
    'unicorn/prefer-ternary': 'off',
    'jsx-a11y/prefer-tag-over-role': 'off',
    'unicorn/prefer-export-from': 'off',
    'unicorn/no-array-sort': 'off',
    'promise/prefer-await-to-then': 'off',
    'promise/prefer-await-to-callbacks': 'off',
    'no-bitwise': 'off',
    'unicorn/consistent-function-scoping': 'off',
    'unicorn/no-object-as-default-parameter': 'off',
    'no-alert': 'off',
    'typescript/return-await': 'off',
    'func-style': ['error', 'declaration', { allowArrowFunctions: true }],
    curly: 'off',
    'no-use-before-define': 'off',
    'react/function-component-definition': [
      'error',
      { namedComponents: 'function-declaration' },
    ],
    'react/todo': 'off',
    'unicorn/filename-case': 'off',
    'no-await-in-loop': 'off',
    'no-void': 'off',
    'typescript/strict-boolean-expressions': 'off',
    'typescript/promise-function-async': 'off',
    'typescript/no-confusing-void-expression': 'off',
    'typescript/strict-void-return': 'off',
    'typescript/no-unnecessary-type-arguments': 'off',
    'typescript/consistent-type-definitions': 'off',
    'typescript/parameter-properties': 'off',
    'unicorn/no-await-expression-member': 'off',
    'unicorn/import-style': 'off',
    'unicorn/no-useless-undefined': 'off',
    'require-unicode-regexp': 'off',
    'prefer-named-capture-group': 'off',
    'promise/avoid-new': 'off',
    complexity: 'off',
    // Convex and TanStack Router throw structured errors/navigation signals.
    'typescript/only-throw-error': 'off',
    'typescript/no-floating-promises': 'error',
    'typescript/no-misused-promises': [
      'error',
      { checksVoidReturn: { attributes: false } },
    ],
  },
  overrides: [
    // Auth CLI supplies a schema-only context; these two assertions are never runtime authentication.
    {
      files: ['convex/betterAuth/auth.ts'],
      rules: { 'typescript/no-unsafe-type-assertion': 'off' },
    },
    {
      files: ['scripts/**/*.mjs', '*.config.mjs'],
      rules: {
        'typescript/no-unsafe-call': 'off',
        'typescript/no-unsafe-assignment': 'off',
        'typescript/no-unsafe-member-access': 'off',
        'typescript/no-unsafe-return': 'off',
        'typescript/no-unsafe-argument': 'off',
      },
    },
    {
      files: ['src/**/*.{ts,tsx}', 'shared/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: [
              {
                name: 'zod',
                message:
                  'Utiliser @shared/zod pour préserver la CSP sans unsafe-eval.',
              },
            ],
            patterns: [{ group: ['zod/*'], message: 'Utiliser @shared/zod.' }],
          },
        ],
      },
    },
    {
      files: ['shared/zod.ts'],
      rules: { 'no-restricted-imports': 'off' },
    },
  ],
})
