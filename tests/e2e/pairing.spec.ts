import { expect, test, type Page } from '@playwright/test';
import { baseUrl, launchApp, type LaunchedApp } from '../support/app';

let kr: LaunchedApp;
const PORT = 47831;

test.beforeEach(async () => {
  kr = await launchApp({ port: PORT, injector: 'fake' });
});

test.afterEach(async () => {
  await kr.close();
});

async function pairByQr(page: Page): Promise<void> {
  const token = await kr.hook('token');
  await page.goto(`${baseUrl(PORT)}/#t=${token}`);
  await expect(page.getByRole('heading', { name: /^Conectado a / })).toBeVisible();
}

test('@pairing empareja por QR, borra el token de la URL y enciende los indicadores', async ({ page }) => {
  await pairByQr(page);
  expect(new URL(page.url()).hash).toBe('');
  await expect.poll(() => kr.hook('state').then((s) => s.session.status)).toBe('active');
  await expect.poll(() => kr.hook('indicators')).toEqual({ live: true, overlay: true });
  const state = await kr.hook('state');
  expect(state.devices).toHaveLength(1);
});

test('@pairing empareja por PIN', async ({ page }) => {
  await page.goto(baseUrl(PORT));
  await page.getByLabel('PIN').fill(await kr.hook('pin'));
  await page.getByRole('button', { name: 'Conectar' }).click();
  await expect(page.getByRole('heading', { name: /^Conectado a / })).toBeVisible();
});

test('@pairing PIN incorrecto se informa', async ({ page }) => {
  await page.goto(baseUrl(PORT));
  const pin = await kr.hook('pin');
  await page.getByLabel('PIN').fill(pin === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: 'Conectar' }).click();
  await expect(page.getByRole('alert')).toContainText('Ese PIN no coincide');
});

test('@pairing reconecta con challenge-response sin volver a aprobar', async ({ page }) => {
  await pairByQr(page);
  await page.getByRole('button', { name: 'Cortar' }).click();
  await expect(page.getByRole('heading', { name: 'Sesión terminada' })).toBeVisible();
  await expect.poll(() => kr.hook('indicators')).toEqual({ live: false, overlay: false });
  await page.goto(baseUrl(PORT));
  await expect(page.getByRole('heading', { name: /^Conectado a / })).toBeVisible();
  expect((await kr.hook('state')).devices).toHaveLength(1);
});

test('@pairing token reusado es rechazado', async ({ page, browser }) => {
  const token = await kr.hook('token');
  await page.goto(`${baseUrl(PORT)}/#t=${token}`);
  await expect(page.getByRole('heading', { name: /^Conectado a / })).toBeVisible();

  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  const second = await other.newPage();
  await second.goto(`${baseUrl(PORT)}/#t=${token}`);
  await expect(second.getByRole('alert')).toContainText('El código QR ya se usó o venció');
  await other.close();
});

test('@pairing dispositivo no emparejado no puede conectarse', async ({ page }) => {
  await page.goto(baseUrl(PORT));
  await page.evaluate(() => {
    localStorage.setItem('kr.credentials.v1', JSON.stringify({ deviceId: 'z'.repeat(22), deviceSecret: 's'.repeat(43) }));
  });
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('ya no reconoce a este celular');
  expect(await page.evaluate(() => localStorage.getItem('kr.credentials.v1'))).toBeNull();
  expect((await kr.hook('state')).session.status).toBe('idle');
});

test('@pairing dispositivo revocado es expulsado y no vuelve a entrar', async ({ page }) => {
  await pairByQr(page);
  const [device] = (await kr.hook('state')).devices;
  if (!device) throw new Error('sin dispositivo');
  await kr.hook('revoke', device.id);
  await expect(page.getByText('La PC quitó el permiso a este celular.')).toBeVisible();
  await page.goto(baseUrl(PORT));
  await expect(page.getByRole('alert')).toContainText('ya no reconoce a este celular');
});

test('@pairing Ctrl+Alt+Shift+K corta la sesión al instante', async ({ page }) => {
  await pairByQr(page);
  await kr.hook('hotkey');
  await expect(page.getByText('Alguien cortó la sesión desde la PC.')).toBeVisible();
  await expect.poll(() => kr.hook('indicators')).toEqual({ live: false, overlay: false });
});

test('@pairing un segundo dispositivo recibe "ocupada"', async ({ page, browser }) => {
  await pairByQr(page);
  const other = await browser.newContext({ ignoreHTTPSErrors: true });
  const second = await other.newPage();
  await second.goto(`${baseUrl(PORT)}/#t=${await kr.hook('token')}`);
  await expect(second.getByRole('heading', { name: 'La PC está ocupada' })).toBeVisible();
  await other.close();
});
