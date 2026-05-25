import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.js'],
    environment: 'node',
    globals: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    setupFiles: ['./vitest-setup.js'],
  },
});
