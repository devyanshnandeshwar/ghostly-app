import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
  },
  {
    // react-refresh/only-export-components is a hot-reload ergonomics rule: a
    // non-component export downgrades a fast refresh to a full page reload. Two
    // places here export non-components by established convention, and splitting
    // them would mean fighting the convention for a dev-only nicety:
    //   - components/ui/*  shadcn ships each primitive with its CVA variants
    //     (buttonVariants, badgeVariants) in the same file.
    //   - context/*        the provider and its useX consumer hook belong
    //     together; separating them is how you get import cycles.
    files: ['src/components/ui/**/*.{ts,tsx}', 'src/context/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
