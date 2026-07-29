import sharedConfig from '@cv-builder/eslint-config';
import tseslint from 'typescript-eslint';

const config = [
  ...sharedConfig,
  ...tseslint.configs.recommendedTypeChecked,
  {
    name: 'cv-builder/api/typescript',
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
    name: 'cv-builder/api/ignores',
    ignores: ['dist/**', 'coverage/**'],
  },
  {
    ...tseslint.configs.disableTypeChecked,
    name: 'cv-builder/api/javascript',
    files: ['**/*.mjs'],
  },
];

export default config;
