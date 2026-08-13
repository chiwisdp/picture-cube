import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

export default ts.config(
  {
    ignores: ['dist/', 'tmp/', 'docs/', 'public/'],
  },
  js.configs.recommended,
  ...ts.configs.recommended,
  ...svelte.configs.recommended,
  prettier,
  ...svelte.configs.prettier,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
    languageOptions: {
      parserOptions: {
        parser: ts.parser,
        extraFileExtensions: ['.svelte'],
        svelteConfig,
      },
    },
  },
  {
    // Svelte 5 runes (`$state`, `$props`, etc.) read as undefined globals to
    // the base no-undef rule; eslint-plugin-svelte's own rules already cover
    // rune misuse, so this rule is redundant inside .svelte files.
    files: ['**/*.svelte'],
    rules: {
      'no-undef': 'off',
    },
  },
);
