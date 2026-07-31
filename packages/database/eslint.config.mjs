import sharedConfig from '@cv-builder/eslint-config';
import tseslint from 'typescript-eslint';

const config = [
  ...sharedConfig,
  ...tseslint.configs.recommendedTypeChecked,
  {
    name: 'cv-builder/database/typescript',
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
    name: 'cv-builder/database/ignores',
    ignores: ['dist/**', 'coverage/**', 'src/generated/**'],
  },
  {
    ...tseslint.configs.disableTypeChecked,
    name: 'cv-builder/database/javascript',
    files: ['**/*.mjs'],
  },
];

export default config;
