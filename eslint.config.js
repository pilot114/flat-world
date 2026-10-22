// check: eslint + prettier --check, fix: eslint --fix + prettier --write — как composer check/fix в pretty-php.
// Найденное на момент заведения — в eslint-suppressions.json (eslint --suppress-all), новое не пройдёт.
import js from '@eslint/js';
import html from 'eslint-plugin-html';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  { files: ['**/*.html'], plugins: { html } },
  {
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.browser, ...globals.node } },
    rules: {},
  },
  // форматирование — дело prettier: правила eslint о стиле выключены
  prettier,
  { ignores: ['dist/'] },
];
