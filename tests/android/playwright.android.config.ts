import { defineConfig } from '@playwright/test';

/** Suite con el emulador (scripts/android-run.mjs la prepara). Un solo worker: hay un solo emulador. */
export default defineConfig({
  testDir: '.',
  testMatch: /.*\.android\.spec\.ts/,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: 'artifacts/results',
});
