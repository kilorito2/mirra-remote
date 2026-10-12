// E2E con el injector real sin emulador: mueve el mouse y tipea en la ventana de prueba de esta PC.
import { spawnSync } from 'node:child_process';

console.warn('\n⚠  Esta prueba usa el injector real: VA A MOVER EL MOUSE Y TECLEAR EN ESTA PC (unos segundos).\n');
const r = spawnSync('npx', ['playwright', 'test', 'real-input', '--config', 'playwright.config.ts', '--project=chromium-mobile'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, KR_E2E_REAL: '1' },
});
process.exit(r.status ?? 1);
