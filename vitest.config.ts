import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const alias = { '@shared': resolve(import.meta.dirname, 'src/shared') };
const define = { __KR_ALLOW_TEST_MODE__: 'true' };

export default defineConfig({
  test: {
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}', 'client/src/**/*.{ts,tsx}'],
      exclude: ['**/*.test.*', 'src/env.d.ts'],
    },
    projects: [
      {
        define,
        resolve: { alias },
        test: {
          name: 'node',
          environment: 'node',
          include: ['src/main/**/*.test.ts', 'src/shared/**/*.test.ts'],
        },
      },
      {
        define,
        resolve: { alias },
        plugins: [react()],
        test: {
          name: 'dom',
          environment: 'jsdom',
          include: ['client/src/**/*.test.{ts,tsx}', 'src/renderer/**/*.test.{ts,tsx}'],
          setupFiles: ['./tests/setup-dom.ts'],
        },
      },
    ],
  },
});
