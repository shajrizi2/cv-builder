import sharedConfig from '@cv-builder/eslint-config';
import tseslint from 'typescript-eslint';

const config = [
  ...sharedConfig,
  ...tseslint.configs.recommendedTypeChecked,
  {
    name: 'cv-builder/worker/typescript',
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
    },
  },
  {
    name: 'cv-builder/worker/ignores',
    ignores: ['dist/**', 'coverage/**'],
  },
  {
    ...tseslint.configs.disableTypeChecked,
    name: 'cv-builder/worker/javascript',
    files: ['**/*.mjs'],
  },
];

export default config;
