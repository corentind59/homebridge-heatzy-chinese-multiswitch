import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**'],
  },
  {
    rules: {
      'quotes': ['error', 'single'],
      'indent': ['error', 2],
      'linebreak-style': ['error', 'unix'],
      'semi': ['error', 'always'],
      'comma-dangle': ['error', 'always-multiline'],
      'dot-notation': 'error',
      'eqeqeq': ['error', 'smart'],
      'curly': ['error', 'all'],
      'brace-style': ['error'],
      'prefer-arrow-callback': 'warn',
      'object-curly-spacing': ['error', 'always'],
      'no-use-before-define': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { 'caughtErrors': 'none' }],
    },
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
    },
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
);
