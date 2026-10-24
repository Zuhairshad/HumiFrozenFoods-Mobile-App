// https://docs.expo.dev/guides/using-eslint/
// Requires: npx expo install eslint eslint-config-expo -- --save-dev
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  { ignores: ['dist/*', '.expo/*', 'node_modules/*'] },
]);
