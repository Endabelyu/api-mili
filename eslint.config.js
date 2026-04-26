import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'build/**',
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'cli/dist/**',
      'cli/templates/**',
      '*.config.js',
      '*.config.ts',
      'scripts/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{js,ts}'],
    languageOptions: {
      globals: {
        ...globals.node,
        RequestInit: 'readonly',
        NodeJS: 'readonly',
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-var': 'error',
      'eqeqeq': ['error', 'smart'],
    },
  },
  {
    files: ['tests/load/**/*.js'],
    languageOptions: {
      globals: {
        __ENV: 'readonly',
      },
    },
  },
  {
    files: ['**/*.test.ts', '**/*.spec.ts', 'vitest.setup.ts', 'server/lib/test-utils.server.ts', 'tests/setup/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.vitest,
        vi: 'readonly',
        expect: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
  },
  {
    files: ['cli/**/*.{js,ts}'],
    rules: {
      'no-console': 'off',
    },
  }
);

