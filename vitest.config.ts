import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 60_000,
    include: ['tests/**/*.test.ts'],
    env: {
      PDFAF_DISABLE_RATE_LIMIT: '1',
    },
  },
});
