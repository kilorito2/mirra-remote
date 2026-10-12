import { expect, test, type Page } from '@playwright/test';
import { baseUrl, launchApp, type LaunchedApp } from '../support/app';
import { clickToolbar } from '../support/toolbar';
import { Touch } from '../support/touch';
import { expectVideoFlowing } from '../support/video';

// Injector REAL sin emulador: mueve el mouse y tipea en la ventana de prueba de esta PC.
// Solo corre con KR_E2E_REAL=1 (npm run test:e2e:real). Antes de tipear exige que el testpad tenga el foco.
test.skip(process.env['KR_E2E_REAL'] !== '1', 'Mueve el mouse real: correr con KR_E2E_REAL=1');

let kr: LaunchedApp;
const PORT = 47835;

test.beforeEach(async () => {
  kr = await launchApp({ port: PORT, injector: 'real', textarea: true });
});

test.afterEach(async () => {
  await kr.close();
});

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

test('clic real en el textarea de la PC y texto con ñ, tildes y @', async ({ page }) => {
  await page.goto(`${baseUrl(PORT)}/#t=${await kr.hook('token')}`);
  await expectVideoFlowing(page, () => kr.hook('startActivity'));
  await clickToolbar(page, /Modo trackpad/);
  await expect(page.getByRole('button', { name: /Modo táctil directo/ })).toBeAttached();

  const target = await kr.hook('testpadTextareaRect');
  const p = await phonePoint(page, target.x + target.width / 2, target.y + target.height / 2);
  await (await Touch.on(page)).tap(p.x, p.y);
  await expect.poll(() => kr.hook('testpadFocused'), { timeout: 5_000 }).toBe(true);

  await clickToolbar(page, 'Teclado');
  const input = page.getByTestId('keyboard-input');
  await input.pressSequentially('Ñandú @ café', { delay: 40 });
  await expect.poll(() => kr.hook('testpadText'), { timeout: 10_000 }).toBe('Ñandú @ café');
  await input.press('Backspace');
  await expect.poll(() => kr.hook('testpadText')).toBe('Ñandú @ caf');
  expect(await kr.hook('pressed')).toEqual({ keys: [], buttons: [] });
});
