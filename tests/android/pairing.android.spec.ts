import { expect, test, type Browser } from '@playwright/test';
import { baseUrl, launchApp, type LaunchedApp } from '../support/app';
import { ANDROID_PORT, openViaIntent, resetChrome, screencap } from './device';

let kr: LaunchedApp;
let browser: Browser | null = null;

test.beforeEach(async () => {
  resetChrome();
  kr = await launchApp({ port: ANDROID_PORT, injector: 'fake' });
});

test.afterEach(async () => {
  await browser?.close();
  browser = null;
  await kr.close();
});

test('Chrome Android empareja abriendo la URL del QR', async () => {
  const token = await kr.hook('token');
  const opened = await openViaIntent(`${baseUrl(ANDROID_PORT)}/#t=${token}`);
  browser = opened.browser;
  const { page } = opened;
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
  expect(await page.evaluate(() => window.isSecureContext && typeof crypto.subtle.sign === 'function')).toBe(true);
  await expect.poll(() => kr.hook('state').then((s) => s.session.status)).toBe('active');
  screencap('fase1-emparejado-qr');
});

test('Chrome Android empareja por PIN', async () => {
  const opened = await openViaIntent(baseUrl(ANDROID_PORT));
  browser = opened.browser;
  const { page } = opened;
  await page.getByLabel('PIN').fill(await kr.hook('pin'));
  await page.getByRole('button', { name: 'Conectar' }).click();
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();
});

test('token reusado y dispositivo sin emparejar son rechazados', async () => {
  const url = `${baseUrl(ANDROID_PORT)}/#t=${await kr.hook('token')}`;
  const opened = await openViaIntent(url);
  browser = opened.browser;
  const { page } = opened;
  await expect(page.getByRole('button', { name: 'Salir' })).toBeVisible();

  // Mismo token, sin credenciales (otro celular que copió el QR): tiene que fallar.
  await page.evaluate(() => localStorage.clear());
  await page.goto('about:blank');
  await page.goto(url);
  await expect(page.getByRole('alert')).toContainText('El código QR ya se usó o venció');

  // Credenciales inventadas: el challenge falla y se borran.
  await page.evaluate(() => {
    localStorage.setItem('kr.credentials.v1', JSON.stringify({ deviceId: 'z'.repeat(22), deviceSecret: 's'.repeat(43) }));
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('ya no reconoce a este celular');
  expect((await kr.hook('state')).session.status).toBe('idle');
});
