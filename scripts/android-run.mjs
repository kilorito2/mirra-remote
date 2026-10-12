// Suite E2E con el emulador Android: arranca el AVD remote-test si hace falta, prepara adb reverse
// y corre Playwright `_android`. Ver ADR-0006.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, openSync } from 'node:fs';
import { join } from 'node:path';
import { androidEnv, AVD_NAME } from './android-env.mjs';

export const ANDROID_PORT = 47820;
const env = androidEnv();

function adb(...args) {
  return spawnSync(env.adb, args, { env: env.processEnv, encoding: 'utf8' });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

if (!existsSync(env.adb) || !existsSync(join(env.avdHome, `${AVD_NAME}.avd`))) {
  console.error('Falta el entorno Android. Corré primero: npm run android:setup');
  process.exit(1);
}

console.warn('\n⚠  Atención: la suite Android usa el injector real y VA A MOVER EL MOUSE Y TECLEAR EN ESTA PC.');
console.warn('   No toques el mouse ni el teclado hasta que termine. Ctrl+C para cancelar.\n');
await sleep(5000);

const running = adb('devices').stdout.split('\n').some((l) => /^emulator-\d+\s+device/.test(l));
let emulator = null;
if (!running) {
  console.info(`Arrancando el emulador ${AVD_NAME}…`);
  const artifacts = join(import.meta.dirname, '..', 'tests', 'android', 'artifacts');
  mkdirSync(artifacts, { recursive: true });
  const logFd = openSync(join(artifacts, 'emulator.log'), 'w');
  // Render por software: con el GPU de la PC, Chrome del emulador se caía al crear el contexto GL
  // y el driver quedaba degradado; con Vulkan por software (SwiftShader) el emulador se caía (ver PROGRESS Fase 3).
  emulator = spawn(env.emulator, ['-avd', AVD_NAME, '-no-snapshot-save', '-no-boot-anim', '-gpu', 'swiftshader_indirect', '-feature', '-Vulkan', '-netdelay', 'none', '-netspeed', 'full'], {
    env: env.processEnv,
    stdio: ['ignore', logFd, logFd],
    detached: false,
  });
  emulator.on('exit', (code) => {
    if (code) console.error(`El emulador terminó con código ${code}. Si no arranca, revisá que Windows Hypervisor Platform esté activado.`);
  });
}

adb('wait-for-device');
for (let i = 0; i < 180; i++) {
  if (adb('shell', 'getprop', 'sys.boot_completed').stdout.trim() === '1') break;
  await sleep(1000);
}
if (adb('shell', 'getprop', 'sys.boot_completed').stdout.trim() !== '1') {
  console.error('El emulador no terminó de arrancar en 3 minutos.');
  process.exit(1);
}

// Root para que Chrome lea /data/local/tmp/chrome-command-line (lo usa Playwright).
adb('root');
await sleep(2000);
adb('wait-for-device');
// El emulador lento dispara diálogos de "no responde" que tapan la pantalla.
adb('shell', 'settings', 'put', 'global', 'hide_error_dialogs', '1');
adb('shell', 'settings', 'put', 'global', 'window_animation_scale', '0');
adb('shell', 'settings', 'put', 'global', 'transition_animation_scale', '0');
adb('shell', 'settings', 'put', 'global', 'animator_duration_scale', '0');
// El emulador sale por NAT: con adb reverse, 127.0.0.1:PUERTO del emulador es el server de la PC.
adb('reverse', `tcp:${ANDROID_PORT}`, `tcp:${ANDROID_PORT}`);

const pw = spawnSync('npx', ['playwright', 'test', '--config', 'tests/android/playwright.android.config.ts', ...process.argv.slice(2)], {
  env: { ...env.processEnv, KR_ANDROID_PORT: String(ANDROID_PORT) },
  stdio: 'inherit',
  shell: true,
});

if (emulator && !process.env.KR_KEEP_EMULATOR) adb('emu', 'kill');
process.exit(pw.status ?? 1);
