import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { _electron as electron, type ElectronApplication } from '@playwright/test';
import type { KrTestHooks } from '../../src/shared/testHooks';

export const ROOT = resolve(import.meta.dirname, '..', '..');

type HookName = keyof KrTestHooks;
type HookArgs<K extends HookName> = Parameters<KrTestHooks[K]>;
type HookResult<K extends HookName> = Awaited<ReturnType<KrTestHooks[K]>>;

export interface LaunchedApp {
  app: ElectronApplication;
  port: number;
  /** Llama a un hook de test expuesto por main (`globalThis.__krTest`). */
  hook<K extends HookName>(name: K, ...args: HookArgs<K>): Promise<HookResult<K>>;
  close(): Promise<void>;
}

/**
 * Levanta la app real (build de test) en REMOTE_TEST_MODE con un userData aislado.
 * `injector: 'fake'` graba el input en vez de mover el mouse de la PC.
 */
export async function launchApp(opts: {
  port: number;
  injector: 'fake' | 'real';
  autoApprove?: boolean;
  textarea?: boolean;
}): Promise<LaunchedApp> {
  const userData = mkdtempSync(join(tmpdir(), 'kr-e2e-'));
  const app = await electron.launch({
    args: [ROOT],
    cwd: ROOT,
    env: {
      ...process.env,
      REMOTE_TEST_MODE: '1',
      KR_AUTO_APPROVE: opts.autoApprove === false ? '0' : '1',
      KR_INJECTOR: opts.injector,
      KR_TEST_TEXTAREA: opts.textarea ? '1' : '0',
      KR_USER_DATA: userData,
      KR_PORT: String(opts.port),
    },
  });

  if (process.env['KR_E2E_DEBUG']) {
    app.process().stdout?.on('data', (d: Buffer) => process.stdout.write(`[main] ${d.toString()}`));
    app.process().stderr?.on('data', (d: Buffer) => process.stdout.write(`[main!] ${d.toString()}`));
  }

  // main expone los hooks al terminar de arrancar.
  for (let i = 0; i < 150; i++) {
    if (await app.evaluate(() => globalThis.__krTest !== undefined)) break;
    await new Promise((r) => setTimeout(r, 100));
  }

  return {
    app,
    port: opts.port,
    hook: (name, ...args) =>
      app.evaluate(
        (_electron, [hookName, hookArgs]) => {
          const hooks = globalThis.__krTest;
          if (!hooks) throw new Error('hooks de test no disponibles');
          const fn = hooks[hookName] as (...a: unknown[]) => unknown;
          return fn(...hookArgs);
        },
        [name, args] as const,
      ) as Promise<HookResult<typeof name>>,
    close: () => app.close(),
  };
}

export function baseUrl(port: number): string {
  return `https://127.0.0.1:${port}`;
}

declare global {
  var __krTest: KrTestHooks | undefined;
}
