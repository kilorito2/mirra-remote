import { expect, test, type Browser } from '@playwright/test';
import { baseUrl, launchApp, type LaunchedApp } from '../support/app';
import { expectVideoFlowing } from '../support/video';
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

test('llega el video de la PC al Chrome del emulador', async () => {
  const opened = await openViaIntent(`${baseUrl(ANDROID_PORT)}/#t=${await kr.hook('token')}`);
  browser = opened.browser;
  const stats = await expectVideoFlowing(opened.page, () => kr.hook('startActivity'));
  expect(stats.frameWidth).toBeGreaterThan(0);
  console.info(`Android: codec=${stats.codec ?? '?'} ${stats.frameWidth}x${stats.frameHeight}`);
  // Captura del emulador para revisarla a ojo (tests/android/artifacts).
  screencap('fase2-video');
});
