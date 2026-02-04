import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  eslint.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/*.js',
      '**/*.mjs',
      '**/*.cjs',
      '.worktrees/**',
      'api/**',
      '**/*.test.ts',
      'eslint.config.ts',
    ],
  },
  {
    files: ['**/*.ts'],
    rules: {
      // Allow numbers/booleans in template literals
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowBoolean: true,
        },
      ],
    },
  }
);
