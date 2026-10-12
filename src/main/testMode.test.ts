import { describe, expect, it } from 'vitest';
import { resolveTestMode, TEST_MODE_OFF } from './testMode';

describe('resolveTestMode', () => {
  it('apagado por defecto', () => {
    expect(resolveTestMode({}, false)).toEqual(TEST_MODE_OFF);
  });

  it('nunca en una app empaquetada, aunque esté la variable', () => {
    expect(resolveTestMode({ REMOTE_TEST_MODE: '1', KR_AUTO_APPROVE: '1' }, true)).toEqual(TEST_MODE_OFF);
  });

  it('solo con el valor exacto "1"', () => {
    expect(resolveTestMode({ REMOTE_TEST_MODE: 'true' }, false).enabled).toBe(false);
  });

  it('activa los sub-flags pedidos', () => {
    const mode = resolveTestMode({ REMOTE_TEST_MODE: '1', KR_AUTO_APPROVE: '1', KR_INJECTOR: 'fake', KR_PORT: '47811' }, false);
    expect(mode).toMatchObject({ enabled: true, autoApprove: true, fakeInjector: true, port: 47811 });
  });

  it('ignora puertos inválidos', () => {
    expect(resolveTestMode({ REMOTE_TEST_MODE: '1', KR_PORT: '99999' }, false).port).toBeNull();
  });
});
