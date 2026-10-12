export interface TestMode {
  /** Acepta loopback (emulador vía `adb reverse`, navegador de Playwright). */
  enabled: boolean;
  autoApprove: boolean;
  fakeInjector: boolean;
  /** Ventana con textarea para la prueba de teclado de la suite Android. */
  textareaWindow: boolean;
  /** Carpeta de userData alternativa para aislar los E2E. */
  userDataDir: string | null;
  port: number | null;
}

export const TEST_MODE_OFF: TestMode = {
  enabled: false,
  autoApprove: false,
  fakeInjector: false,
  textareaWindow: false,
  userDataDir: null,
  port: null,
};

/**
 * ADR-0008: con `__KR_ALLOW_TEST_MODE__ = false` (build de producción) toda la condición es `false`
 * en compilación y el bundler elimina la rama, incluido el nombre de la variable.
 */
export function resolveTestMode(env: NodeJS.ProcessEnv, isPackaged: boolean): TestMode {
  if (__KR_ALLOW_TEST_MODE__ && !isPackaged && env['REMOTE_TEST_MODE'] === '1') {
    const port = Number(env['KR_PORT']);
    return {
      enabled: true,
      autoApprove: env['KR_AUTO_APPROVE'] === '1',
      fakeInjector: env['KR_INJECTOR'] === 'fake',
      textareaWindow: env['KR_TEST_TEXTAREA'] === '1',
      userDataDir: env['KR_USER_DATA'] ?? null,
      port: Number.isInteger(port) && port > 0 && port < 65536 ? port : null,
    };
  }
  return TEST_MODE_OFF;
}
