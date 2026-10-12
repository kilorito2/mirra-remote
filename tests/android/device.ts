import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, type Browser, type Page } from '@playwright/test';
import { androidEnv } from '../../scripts/android-env.mjs';

const env = androidEnv();
export const ANDROID_PORT = Number(process.env['KR_ANDROID_PORT'] ?? '47820');
export const ARTIFACTS = join(import.meta.dirname, 'artifacts');
const CDP_PORT = 9333;

// Flags de Chrome: sin pantallas de primer uso y aceptando el certificado autofirmado
// (equivale a launchBrowser({ ignoreHTTPSErrors: true }) pero vale también para pestañas abiertas por intent).
const CHROME_FLAGS = [
  '_',
  '--disable-fre',
  '--no-default-browser-check',
  '--no-first-run',
  '--ignore-certificate-errors',
  '--disable-features=PrivacySandboxSettings4',
].join(' ');

export function adb(...args: string[]): string {
  return execFileSync(env.adb, args, { env: { ...env.processEnv, MSYS_NO_PATHCONV: '1' }, encoding: 'utf8' });
}

/** Chrome limpio con los flags de test. Se llama antes de cada test. */
export function resetChrome(): void {
  adb('shell', 'am', 'force-stop', 'com.android.chrome');
  adb('shell', 'pm', 'clear', 'com.android.chrome');
  adb('shell', 'pm', 'grant', 'com.android.chrome', 'android.permission.POST_NOTIFICATIONS');
  adb('shell', `echo '${CHROME_FLAGS}' > /data/local/tmp/chrome-command-line`);
  adb('shell', 'chmod', '644', '/data/local/tmp/chrome-command-line');
  // Chrome lee la línea de comandos de ese archivo solo si es la app de depuración elegida.
  adb('shell', 'am', 'set-debug-app', '--persistent', 'com.android.chrome');
}

/**
 * Abre una URL como lo haría el usuario al escanear el QR: un intent VIEW hacia Chrome
 * (el emulador no puede escanear). Después se conecta por CDP y devuelve esa pestaña.
 */
export async function openViaIntent(url: string): Promise<{ browser: Browser; page: Page }> {
  adb('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', `'${url}'`, 'com.android.chrome');
  adb('forward', `tcp:${CDP_PORT}`, 'localabstract:chrome_devtools_remote');
  let browser: Browser | null = null;
  for (let i = 0; i < 30 && !browser; i++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
    } catch {
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  if (!browser) throw new Error('No se pudo conectar por CDP a Chrome del emulador');
  const origin = new URL(url).origin;
  for (let i = 0; i < 40; i++) {
    const page = browser
      .contexts()
      .flatMap((c) => c.pages())
      .find((p) => p.url().startsWith(origin));
    if (page) {
      await page.waitForLoadState('domcontentloaded');
      return { browser, page };
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Chrome no abrió ${origin}`);
}

/** Captura de pantalla del emulador (adb exec-out screencap -p) para revisarla a ojo. */
export function screencap(name: string): string {
  mkdirSync(ARTIFACTS, { recursive: true });
  const png = execFileSync(env.adb, ['exec-out', 'screencap', '-p'], { env: env.processEnv, maxBuffer: 64 * 1024 * 1024 });
  const path = join(ARTIFACTS, `${name}.png`);
  writeFileSync(path, png);
  return path;
}
