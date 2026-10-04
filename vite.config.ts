import { defineConfig, configDefaults } from 'vitest/config';

// base must match the GitHub Pages project subpath:
// https://systemslibrarian.github.io/crypto-lab-locks-and-keys/
export default defineConfig({
  base: '/crypto-lab-locks-and-keys/',
  test: {
    // Colocated unit tests only; keep the Playwright specs in e2e/ out of the
    // Vitest run so they are not collected as unit tests (§1 of the template).
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'e2e/**'],
  },
});
