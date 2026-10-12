import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { baseUrl, launchApp, type LaunchedApp } from '../support/app';
import { clickToolbar } from '../support/toolbar';
import { expectVideoFlowing } from '../support/video';

// Solo Chromium (WebKit de Windows no trae WebRTC, ADR-0006).
let kr: LaunchedApp;
let savedClipboard = '';
const PORT = 47836;

test.beforeEach(async ({ context }) => {
  kr = await launchApp({ port: PORT, injector: 'fake' });
  // El portapapeles de la PC es el real: se guarda y se restaura.
  savedClipboard = await kr.hook('clipboardRead');
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl(PORT) });
});

test.afterEach(async () => {
  await kr.hook('clipboardWrite', savedClipboard);
  await kr.close();
});

async function connect(page: Page): Promise<void> {
  await page.goto(`${baseUrl(PORT)}/#t=${await kr.hook('token')}`);
  await expectVideoFlowing(page, () => kr.hook('startActivity'));
}

async function openSheet(page: Page, name: 'Portapapeles' | 'Archivos'): Promise<void> {
  await clickToolbar(page, 'Más opciones');
  await page.getByRole('button', { name }).click();
}

test('portapapeles: del celular a la PC y de la PC al celular', async ({ page }) => {
  await connect(page);
  await openSheet(page, 'Portapapeles');
  await page.getByTestId('clipboard-draft').fill('desde el celu: ñandú €');
  await page.getByRole('button', { name: 'Mandar a la PC' }).click();
  await expect.poll(() => kr.hook('clipboardRead')).toBe('desde el celu: ñandú €');

  await kr.hook('clipboardWrite', 'desde la PC: café @');
  await page.getByRole('button', { name: 'Traer de la PC' }).click();
  await expect(page.getByTestId('pc-clipboard')).toHaveText('desde la PC: café @');
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe('desde la PC: café @');
});

test('archivo del celular a la PC (con nombre saneado y tamaño exacto)', async ({ page }) => {
  await connect(page);
  await openSheet(page, 'Archivos');
  const big = Buffer.alloc(3 * 1024 * 1024 + 123, 7);
  await page.getByTestId('file-input').setInputFiles({ name: 'con.txt', mimeType: 'text/plain', buffer: big });
  await expect.poll(() => kr.hook('receivedFiles'), { timeout: 30_000 }).toEqual([{ name: '_con.txt', size: big.length }]);
  await expect(page.getByLabel('Transferencias').getByText('Listo')).toBeVisible();
});

test('archivo de la PC al celular (descarga como Blob)', async ({ page }) => {
  await connect(page);
  const dir = mkdtempSync(join(tmpdir(), 'kr-tophone-'));
  const path = join(dir, 'informe.pdf');
  writeFileSync(path, Buffer.alloc(2 * 1024 * 1024 + 5, 3));
  const download = page.waitForEvent('download', { timeout: 30_000 });
  await kr.hook('sendFileToPhone', path);
  const file = await download;
  expect(file.suggestedFilename()).toBe('informe.pdf');
  const saved = join(dir, 'recibido.pdf');
  await file.saveAs(saved);
  const { statSync } = await import('node:fs');
  expect(statSync(saved).size).toBe(2 * 1024 * 1024 + 5);
});

test('stats y calidad desde el celular', async ({ page }) => {
  await connect(page);
  await clickToolbar(page, 'Más opciones');
  await page.getByRole('button', { name: 'Estadísticas' }).click();
  await page.getByRole('button', { name: 'Ahorro' }).click();
  await expect.poll(async () => (await kr.hook('state')).settings.preset).toBe('saver');
  await page.getByRole('button', { name: 'Cerrar' }).click();
  await expect(page.getByLabel('Estadísticas de la conexión')).toContainText('H264');
});

test('audio: arranca silenciado y se activa con el botón', async ({ page }) => {
  await connect(page);
  const muted = () => page.getByTestId('remote-video').evaluate((v: HTMLVideoElement) => v.muted);
  expect(await muted()).toBe(true);
  await clickToolbar(page, 'Activar el audio de la PC');
  expect(await muted()).toBe(false);
});

test('corte de red del celular: reconecta solo y vuelve el video', async ({ page, context }) => {
  await connect(page);
  await context.setOffline(true);
  await page.waitForTimeout(4_000);
  await context.setOffline(false);
  await expectVideoFlowing(page, () => kr.hook('startActivity'));
  await expect(page.getByText('Reconectando…')).toHaveCount(0, { timeout: 20_000 });
  expect((await kr.hook('state')).session.status).toBe('active');
});
