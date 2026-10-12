import { expect, test, type Page } from '@playwright/test';
import type { InjectedAction } from '../../src/shared/testHooks';
import { baseUrl, launchApp, type LaunchedApp } from '../support/app';
import { clickToolbar } from '../support/toolbar';
import { Touch } from '../support/touch';
import { expectVideoFlowing } from '../support/video';

let kr: LaunchedApp;
const PORT = 47834;

// Solo corre en Chromium: el proyecto WebKit filtra por @pairing porque no trae WebRTC (ADR-0006).
test.beforeEach(async () => {
  kr = await launchApp({ port: PORT, injector: 'fake' });
});

test.afterEach(async () => {
  await kr.close();
});

async function connect(page: Page): Promise<{ touch: Touch; box: { x: number; y: number; width: number; height: number } }> {
  await page.goto(`${baseUrl(PORT)}/#t=${await kr.hook('token')}`);
  await expectVideoFlowing(page, () => kr.hook('startActivity'));
  // Espera a que el canal de input esté abierto (el primer movimiento llega a la PC).
  await kr.hook('clearInjected');
  const box = await page.getByTestId('surface').boundingBox();
  if (!box) throw new Error('sin superficie');
  return { touch: await Touch.on(page), box };
}

const injected = () => kr.hook('injected');

const buttons = (actions: InjectedAction[]) =>
  actions.filter((a): a is Extract<InjectedAction, { type: 'button' }> => a.type === 'button').map((a) => `${a.button}:${a.action}`);

test('trackpad: tap = clic izquierdo, sin nada apretado después', async ({ page }) => {
  const { touch, box } = await connect(page);
  await touch.tap(box.width / 2, box.height / 2);
  await expect.poll(async () => buttons(await injected())).toEqual(['left:down', 'left:up']);
  expect(await kr.hook('pressed')).toEqual({ keys: [], buttons: [] });
});

test('trackpad: arrastrar un dedo mueve el cursor dentro del display', async ({ page }) => {
  const { touch, box } = await connect(page);
  await touch.drag({ x: box.width * 0.3, y: box.height * 0.5 }, { x: box.width * 0.7, y: box.height * 0.5 });
  await expect.poll(async () => (await injected()).filter((a) => a.type === 'move').length).toBeGreaterThan(3);
  const rect = await kr.hook('activeRect');
  const moves = (await injected()).filter((a): a is Extract<InjectedAction, { type: 'move' }> => a.type === 'move');
  const xs = moves.map((m) => m.x);
  expect(xs.at(-1) ?? 0).toBeGreaterThan(xs[0] ?? 0);
  for (const m of moves) {
    expect(m.x).toBeGreaterThanOrEqual(rect.x);
    expect(m.x).toBeLessThan(rect.x + rect.width);
  }
  expect(buttons(await injected())).toEqual([]);
});

test('tap con dos dedos = clic derecho', async ({ page }) => {
  const { touch, box } = await connect(page);
  await touch.twoFingerTap({ x: box.width * 0.45, y: box.height / 2 }, { x: box.width * 0.55, y: box.height / 2 });
  await expect.poll(async () => buttons(await injected())).toEqual(['right:down', 'right:up']);
});

test('arrastrar dos dedos = scroll', async ({ page }) => {
  const { touch, box } = await connect(page);
  const y0 = box.height * 0.7;
  const y1 = box.height * 0.3;
  await touch.twoFinger(
    [{ x: box.width * 0.45, y: y0 }, { x: box.width * 0.55, y: y0 }],
    [{ x: box.width * 0.45, y: y1 }, { x: box.width * 0.55, y: y1 }],
  );
  await expect
    .poll(async () => (await injected()).filter((a) => a.type === 'scroll').reduce((s, a) => s + a.dy, 0))
    .toBeGreaterThan(0);
  expect(buttons(await injected())).toEqual([]);
});

test('mantener y arrastrar = arrastre con el botón apretado, y se suelta al final', async ({ page }) => {
  const { touch, box } = await connect(page);
  await touch.drag({ x: box.width * 0.4, y: box.height * 0.5 }, { x: box.width * 0.6, y: box.height * 0.6 }, { holdMs: 600 });
  await expect.poll(async () => buttons(await injected())).toEqual(['left:down', 'left:up']);
  const actions = await injected();
  const downAt = actions.findIndex((a) => a.type === 'button' && a.action === 'down');
  const upAt = actions.findIndex((a) => a.type === 'button' && a.action === 'up');
  expect(actions.slice(downAt, upAt).some((a) => a.type === 'move')).toBe(true);
});

test('táctil directo: el clic cae donde se toca', async ({ page }) => {
  const { touch, box } = await connect(page);
  await clickToolbar(page, /Modo trackpad/);
  await kr.hook('clearInjected');
  // Centro de la superficie = centro del frame (el video está centrado con letterbox).
  await touch.tap(box.width / 2, box.height / 2);
  await expect.poll(async () => buttons(await injected())).toEqual(['left:down', 'left:up']);
  const rect = await kr.hook('activeRect');
  const move = (await injected()).find((a): a is Extract<InjectedAction, { type: 'move' }> => a.type === 'move');
  expect(Math.abs((move?.x ?? 0) - (rect.x + rect.width / 2))).toBeLessThan(rect.width * 0.02);
  expect(Math.abs((move?.y ?? 0) - (rect.y + rect.height / 2))).toBeLessThan(rect.height * 0.02);
});

test('teclado: texto con ñ, tildes, @ y €, y backspace', async ({ page }) => {
  await connect(page);
  await clickToolbar(page, 'Teclado');
  const input = page.getByTestId('keyboard-input');
  await expect(input).toBeFocused();
  await input.pressSequentially('ñandú @ €');
  await input.press('Backspace');
  await expect
    .poll(async () => (await injected()).filter((a) => a.type === 'text').map((a) => a.text).join(''))
    .toBe('ñandú @ €');
  expect((await injected()).some((a) => a.type === 'key' && a.key === 'backspace')).toBe(true);
});

test('teclas especiales: combo y modificador pegado + letra del teclado', async ({ page }) => {
  await connect(page);
  await clickToolbar(page, 'Teclas especiales');
  await page.getByRole('button', { name: 'Alt+Tab' }).click();
  await page.getByRole('button', { name: 'Ctrl', exact: true }).click();
  await page.getByRole('button', { name: 'Esc' }).click();
  await expect
    .poll(async () => (await injected()).filter((a) => a.type === 'key').map((a) => `${a.key}:${a.action}`))
    .toEqual(['alt:down', 'tab:down', 'tab:up', 'alt:up', 'ctrl:down', 'escape:down', 'escape:up', 'ctrl:up']);
  await page.getByRole('button', { name: 'Ctrl+Alt+Supr, no disponible' }).click();
  await expect(page.getByText('requiere el servicio nativo')).toBeVisible();
});

test('cerrar la página con Ctrl apretado: la PC lo suelta', async ({ page }) => {
  await connect(page);
  await page.evaluate(() => window.__krDebug?.sendControl({ t: 'key', key: 'ctrl', action: 'down' }));
  await expect.poll(() => kr.hook('pressed')).toEqual({ keys: ['ctrl'], buttons: [] });
  await page.close();
  await expect.poll(() => kr.hook('pressed'), { timeout: 15_000 }).toEqual({ keys: [], buttons: [] });
  const actions = await injected();
  expect(actions.at(-1)).toEqual({ type: 'key', key: 'ctrl', action: 'up' });
});
