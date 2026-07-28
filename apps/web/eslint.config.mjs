import sharedConfig from '@cv-builder/eslint-config';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypeScript from 'eslint-config-next/typescript';

const config = [
  ...sharedConfig,
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    name: 'cv-builder/web/ignores',
    ignores: ['.next/**', 'coverage/**', 'next-env.d.ts'],
  },
];

export default config;
