import { expect, test, type Browser, type Page } from '@playwright/test';
import { baseUrl, launchApp, type LaunchedApp } from '../support/app';
import { clickToolbar } from '../support/toolbar';
import { Touch } from '../support/touch';
import { expectVideoFlowing } from '../support/video';
import { ANDROID_PORT, openViaIntent, resetChrome, screencap } from './device';

// Injector REAL (robotjs): el mouse de la PC se mueve y se tipea en la ventana de prueba.
// Los clics y el texto van solo al testpad; antes de tipear se exige que tenga el foco.
let kr: LaunchedApp;
let browser: Browser | null = null;

test.beforeEach(async () => {
  resetChrome();
  kr = await launchApp({ port: ANDROID_PORT, injector: 'real', textarea: true });
});

test.afterEach(async () => {
  await browser?.close();
  browser = null;
  await kr.close();
});

async function session(): Promise<{ page: Page; touch: Touch }> {
  const opened = await openViaIntent(`${baseUrl(ANDROID_PORT)}/#t=${await kr.hook('token')}`);
  browser = opened.browser;
  await kr.hook('startActivity');
  await expectVideoFlowing(opened.page, () => kr.hook('startActivity'));
  return { page: opened.page, touch: await Touch.on(opened.page) };
}

/** Punto de la pantalla del celular que corresponde a una coordenada normalizada del frame (sin zoom). */
async function phonePoint(page: Page, nx: number, ny: number): Promise<{ x: number; y: number }> {
  return page.evaluate(
    ([x, y]) => {
      const v = document.querySelector('video');
      if (!v) throw new Error('sin video');
      const r = v.getBoundingClientRect();
      const s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
      const w = v.videoWidth * s;
      const h = v.videoHeight * s;
      return { x: r.left + (r.width - w) / 2 + x * w, y: r.top + (r.height - h) / 2 + y * h };
    },
    [nx, ny] as const,
  );
}


test('trackpad: arrastrar mueve el cursor real de la PC', async () => {
  const { page, touch } = await session();
  const box = await page.getByTestId('surface').boundingBox();
  if (!box) throw new Error('sin superficie');
  const before = await kr.hook('cursor');
  const rect = await kr.hook('activeRect');
  // Se arrastra hacia el lado con más espacio (el cursor puede haber quedado en un borde).
  const toRight = before.x < rect.x + rect.width / 2;
  const [x0, x1] = toRight ? [0.3, 0.6] : [0.6, 0.3];
  await touch.drag({ x: box.width * x0, y: box.height * 0.5 }, { x: box.width * x1, y: box.height * 0.5 }, { steps: 12 });
  await expect
    .poll(async () => ((await kr.hook('cursor')).x - before.x) * (toRight ? 1 : -1), { timeout: 10_000 })
    .toBeGreaterThan(20);
  expect(await kr.hook('pressed')).toEqual({ keys: [], buttons: [] });
});

test('táctil directo: el cursor real llega a donde se tocó', async () => {
  const { page, touch } = await session();
  await clickToolbar(page, /Modo trackpad/);
  await expect(page.getByRole('button', { name: /Modo táctil directo/ })).toBeAttached();
  const target = await kr.hook('testpadTextareaRect');
  const nx = target.x + target.width / 2;
  const ny = target.y + target.height / 2;
  const p = await phonePoint(page, nx, ny);
  await touch.tap(p.x, p.y);
  const rect = await kr.hook('activeRect');
  const expected = { x: rect.x + nx * rect.width, y: rect.y + ny * rect.height };
  await expect
    .poll(async () => {
      const c = await kr.hook('cursor');
      return Math.hypot(c.x - expected.x, c.y - expected.y);
    })
    // El video del emulador es chico: 1 px del celular son varios de la PC.
    .toBeLessThan(rect.width * 0.02);
  screencap('fase3-directo');
});

test('dos dedos: scroll y pellizco (zoom local) sin dejar nada apretado', async () => {
  const { page, touch } = await session();
  const box = await page.getByTestId('surface').boundingBox();
  if (!box) throw new Error('sin superficie');
  const cx = box.width / 2;
  const cy = box.height / 2;
  await touch.twoFinger(
    [{ x: cx - 40, y: cy + 80 }, { x: cx + 40, y: cy + 80 }],
    [{ x: cx - 40, y: cy - 20 }, { x: cx + 40, y: cy - 20 }],
  );
  await touch.twoFinger(
    [{ x: cx - 30, y: cy }, { x: cx + 30, y: cy }],
    [{ x: cx - 140, y: cy }, { x: cx + 140, y: cy }],
  );
  const scale = await page.evaluate(() => {
    const layer = document.querySelector('[data-testid="remote-video"]')?.parentElement;
    const m = layer ? /scale\(([\d.]+)\)/.exec(layer.style.transform) : null;
    return m ? Number(m[1]) : 1;
  });
  expect(scale).toBeGreaterThan(1.5);
  expect(await kr.hook('pressed')).toEqual({ keys: [], buttons: [] });
  screencap('fase3-zoom');
});

test('cortar el canal con Ctrl apretado: la PC lo suelta', async () => {
  const { page } = await session();
  await page.evaluate(() => window.__krDebug?.sendControl({ t: 'key', key: 'ctrl', action: 'down' }));
  await expect.poll(() => kr.hook('pressed')).toEqual({ keys: ['ctrl'], buttons: [] });
  // Se cierra la pestaña del celular: el DataChannel se corta.
  await page.close();
  await expect.poll(() => kr.hook('pressed'), { timeout: 15_000 }).toEqual({ keys: [], buttons: [] });
});
