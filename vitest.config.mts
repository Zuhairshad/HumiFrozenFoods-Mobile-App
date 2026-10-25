import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const src = fileURLToPath(new URL('./src', import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@/': `${src}/`,
      '@react-native-async-storage/async-storage': fileURLToPath(
        new URL('./tests/mocks/async-storage.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    clearMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      include: [
        'src/store/catalog.ts',
        'src/lib/api/catalog-client.ts',
        'src/data/merge.ts',
        'src/data/id-migration.ts',
        'src/data/selectors.ts',
      ],
      thresholds: { lines: 85, statements: 85, functions: 85, branches: 85 },
    },
  },
});
