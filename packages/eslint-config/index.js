const baseConfig = [
  {
    name: 'cv-builder/base',
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    rules: {
      'no-constant-condition': 'error',
      'no-debugger': 'error',
      'no-duplicate-imports': 'error',
      'no-unreachable': 'error',
      'no-unused-private-class-members': 'error',
      'no-useless-catch': 'error',
      'prefer-const': 'error',
    },
  },
];

export default baseConfig;
