import { expect, test, type Browser } from '@playwright/test';
import type { InjectedAction } from '../../src/shared/testHooks';
import { baseUrl, launchApp, type LaunchedApp } from '../support/app';
import { clickToolbar } from '../support/toolbar';
import { expectVideoFlowing } from '../support/video';
import { ANDROID_PORT, openViaIntent, resetChrome } from './device';

// El teclado del celular (Chrome Android, keyCode 229 / beforeinput) con FakeInjector: se verifica que el texto
// llegue intacto a la PC. La inyección real en Windows la cubre `npm run test:e2e:real` (sin emulador).
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

test('teclado del celular: ñ, tildes y @ llegan a la PC', async () => {
  const opened = await openViaIntent(`${baseUrl(ANDROID_PORT)}/#t=${await kr.hook('token')}`);
  browser = opened.browser;
  const { page } = opened;
  await expectVideoFlowing(page, () => kr.hook('startActivity'));
  await clickToolbar(page, 'Teclado');
  const input = page.getByTestId('keyboard-input');
  await expect(input).toBeFocused();
  await input.pressSequentially('Ñandú @ café', { delay: 60 });
  await input.press('Backspace');
  // Lo que vería la PC: texto y backspaces aplicados en orden (el teclado reemplaza la palabra en composición).
  await expect.poll(async () => replay(await kr.hook('injected')), { timeout: 15_000 }).toBe('Ñandú @ caf');
});

function replay(actions: InjectedAction[]): string {
  let text: string[] = [];
  for (const a of actions) {
    if (a.type === 'text') text = [...text, ...Array.from(a.text)];
    else if (a.type === 'key' && a.key === 'backspace' && a.action === 'down') text = text.slice(0, -1);
  }
  return text.join('');
}
