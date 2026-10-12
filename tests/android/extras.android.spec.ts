import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseUrl, launchApp, type LaunchedApp } from '../support/app';
import { clickToolbar } from '../support/toolbar';
import { expectVideoFlowing } from '../support/video';
import { adb, ANDROID_PORT, openViaIntent, resetChrome, screencap } from './device';

let kr: LaunchedApp;
let browser: Browser | null = null;
let savedClipboard = '';

test.beforeEach(async () => {
  resetChrome();
  kr = await launchApp({ port: ANDROID_PORT, injector: 'fake' });
  savedClipboard = await kr.hook('clipboardRead');
});

test.afterEach(async () => {
  adb('shell', 'svc', 'wifi', 'enable');
  await kr.hook('clipboardWrite', savedClipboard);
  await browser?.close();
  browser = null;
  await kr.close();
});

async function session(): Promise<Page> {
  const opened = await openViaIntent(`${baseUrl(ANDROID_PORT)}/#t=${await kr.hook('token')}`);
  browser = opened.browser;
  await expectVideoFlowing(opened.page, () => kr.hook('startActivity'));
  return opened.page;
}

test('portapapeles en ambos sentidos', async () => {
  const page = await session();
  await clickToolbar(page, 'Más opciones');
  await page.getByRole('button', { name: 'Portapapeles' }).click();
  await page.getByTestId('clipboard-draft').fill('hola desde Android ñ');
  await page.getByRole('button', { name: 'Mandar a la PC' }).click();
  await expect.poll(() => kr.hook('clipboardRead')).toBe('hola desde Android ñ');
  await kr.hook('clipboardWrite', 'hola desde la PC é');
  await page.getByRole('button', { name: 'Traer de la PC' }).click();
  await expect(page.getByTestId('pc-clipboard')).toHaveText('hola desde la PC é');
});

test('archivo del celular a la PC', async () => {
  const page = await session();
  await clickToolbar(page, 'Más opciones');
  await page.getByRole('button', { name: 'Archivos' }).click();
  const data = Buffer.alloc(1024 * 1024 + 77, 9);
  await page.getByTestId('file-input').setInputFiles({ name: 'foto.jpg', mimeType: 'image/jpeg', buffer: data });
  await expect.poll(() => kr.hook('receivedFiles'), { timeout: 60_000 }).toEqual([{ name: 'foto.jpg', size: data.length }]);
  screencap('fase4-archivo');
});

test('corte de WiFi del emulador: reconecta solo', async () => {
  const page = await session();
  adb('shell', 'svc', 'wifi', 'disable');
  adb('shell', 'svc', 'data', 'disable');
  await page.waitForTimeout(6_000);
  adb('shell', 'svc', 'wifi', 'enable');
  adb('shell', 'svc', 'data', 'enable');
  await expectVideoFlowing(page, () => kr.hook('startActivity'));
  await expect(page.getByText('Reconectando…')).toHaveCount(0, { timeout: 45_000 });
  expect((await kr.hook('state')).session.status).toBe('active');
  screencap('fase4-reconectado');
});
