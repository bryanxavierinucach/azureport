import eslint from '@eslint/js';
import { globalIgnores } from 'eslint/config';
import tseslint from 'typescript-eslint';

const eslintConfig = tseslint.config(
  globalIgnores(['.next/**', '.netlify/**', '.vinext/**', 'dist/**']),
  eslint.configs.recommended,
  tseslint.configs.recommended,
);

export default eslintConfig;
