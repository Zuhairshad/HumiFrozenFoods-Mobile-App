import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/index.ts', 'src/vercel.ts', 'src/scripts/**', 'src/bootstrap.ts'],
      reporter: ['text-summary', 'text', 'lcov'],
      thresholds: {
        'src/lib/**': { lines: 90, statements: 90, functions: 90 },
        'src/middleware/**': { lines: 90, statements: 90, functions: 90 },
      },
    },
  },
});
