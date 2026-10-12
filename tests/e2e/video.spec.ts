import { expect, test } from '@playwright/test';
import { baseUrl, launchApp, type LaunchedApp } from '../support/app';
import { expectVideoFlowing, readStats } from '../support/video';

let kr: LaunchedApp;
const PORT = 47833;

// Solo corre en Chromium: el proyecto WebKit filtra por @pairing porque no trae WebRTC (ADR-0006).
test.beforeEach(async () => {
  kr = await launchApp({ port: PORT, injector: 'fake' });
});

test.afterEach(async () => {
  await kr.close();
});

test('llega video de la PC y los frames avanzan', async ({ page }) => {
  await page.goto(`${baseUrl(PORT)}/#t=${await kr.hook('token')}`);
  const stats = await expectVideoFlowing(page, () => kr.hook('startActivity'));
  // ADR-0003: H.264 si Electron lo ofrece; si no, VP8.
  expect(stats.codec).toMatch(/video\/(H264|VP8)/i);
  console.info(`codec=${stats.codec ?? '?'} ${stats.frameWidth}x${stats.frameHeight}`);
});

test('cambiar el preset en vivo no corta el video', async ({ page }) => {
  await page.goto(`${baseUrl(PORT)}/#t=${await kr.hook('token')}`);
  await expectVideoFlowing(page, () => kr.hook('startActivity'));
  await kr.hook('setPreset', 'saver');
  await expect.poll(async () => (await readStats(page))?.frameHeight ?? 0, { timeout: 20_000 }).toBeLessThanOrEqual(720);
  await kr.hook('setPreset', 'sharp');
  await expectVideoFlowing(page, () => kr.hook('startActivity'));
});

test('ICE restart pedido por el celular mantiene la sesión', async ({ page }) => {
  await page.goto(`${baseUrl(PORT)}/#t=${await kr.hook('token')}`);
  await expectVideoFlowing(page, () => kr.hook('startActivity'));
  await page.evaluate(() => window.__krDebug?.restart());
  await expectVideoFlowing(page, () => kr.hook('startActivity'));
  expect((await kr.hook('state')).session.status).toBe('active');
});

test('recargar la página reanuda con challenge y vuelve el video', async ({ page }) => {
  await page.goto(`${baseUrl(PORT)}/#t=${await kr.hook('token')}`);
  await expectVideoFlowing(page, () => kr.hook('startActivity'));
  await page.reload();
  await expectVideoFlowing(page, () => kr.hook('startActivity'));
});
