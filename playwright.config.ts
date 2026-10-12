import { defineConfig, devices } from '@playwright/test';

/**
 * E2E de escritorio: la app Electron real (REMOTE_TEST_MODE + FakeInjector) y un navegador con emulación móvil.
 * WebKit en Windows no trae WebRTC (ADR-0006): ese proyecto corre solo los tests de emparejamiento.
 */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: { ignoreHTTPSErrors: true, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium-mobile', use: { ...devices['Pixel 7'] } },
    { name: 'webkit-mobile', use: { ...devices['iPhone 14'] }, grep: /@pairing/ },
  ],
});
