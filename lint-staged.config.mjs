export default {
  '*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}': [
    'oxfmt --write',
    'oxlint --type-aware --deny-warnings',
  ],
  '*.{json,jsonc,css,md,mdc,yml,yaml}': ['oxfmt --write'],
}
