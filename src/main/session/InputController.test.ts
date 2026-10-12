import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeInjector } from '../adapters/FakeInjector';
import { InputController } from './InputController';

const RECT = { x: 1920, y: 200, width: 2560, height: 1440 };

function setup() {
  let now = 1_000_000;
  const injector = new FakeInjector();
  const onRateLimited = vi.fn();
  const ctl = new InputController({ injector, displayRect: () => RECT, clock: () => now, onRateLimited, watchdogIntervalMs: 60_000 });
  ctl.start();
  return { ctl, injector, onRateLimited, advance: (ms: number) => (now += ms) };
}

let current: InputController | null = null;
afterEach(async () => {
  await current?.stop();
  current = null;
});

describe('InputController', () => {
  it('mueve al display elegido y clampea', async () => {
    const { ctl, injector } = setup();
    current = ctl;
    await ctl.handle({ t: 'pointer.move', seq: 1, x: 0.5, y: 0.5 });
    await ctl.handle({ t: 'pointer.move', seq: 2, x: 1.8, y: -0.4 });
    expect(injector.actions).toEqual([
      { type: 'move', x: 1920 + 1280, y: 200 + 720 },
      { type: 'move', x: 1920 + 2559, y: 200 },
    ]);
  });

  it('descarta movimientos viejos del canal desordenado (y tolera el wrap)', async () => {
    const { ctl, injector } = setup();
    current = ctl;
    await ctl.handle({ t: 'pointer.move', seq: 10, x: 0.1, y: 0.1 });
    await ctl.handle({ t: 'pointer.move', seq: 9, x: 0.9, y: 0.9 });
    await ctl.handle({ t: 'pointer.move', seq: 10, x: 0.9, y: 0.9 });
    await ctl.handle({ t: 'pointer.move', seq: 0xffff_ffff, x: 0.2, y: 0.2 });
    expect(injector.actions.filter((a) => a.type === 'move')).toHaveLength(1);

    const wrap = setup();
    current = wrap.ctl;
    await wrap.ctl.handle({ t: 'pointer.move', seq: 0xffff_fffe, x: 0.1, y: 0.1 });
    await wrap.ctl.handle({ t: 'pointer.move', seq: 1, x: 0.2, y: 0.2 });
    expect(wrap.injector.actions).toHaveLength(2);
  });

  it('cada clic lleva su coordenada', async () => {
    const { ctl, injector } = setup();
    current = ctl;
    await ctl.handle({ t: 'pointer.button', button: 'left', action: 'click', x: 0, y: 0 });
    expect(injector.actions).toEqual([
      { type: 'move', x: 1920, y: 200 },
      { type: 'button', button: 'left', action: 'down' },
      { type: 'button', button: 'left', action: 'up' },
    ]);
  });

  it('combo aprieta en orden y suelta al revés', async () => {
    const { ctl, injector } = setup();
    current = ctl;
    await ctl.handle({ t: 'combo', keys: ['ctrl', 'shift', 'escape'] });
    expect(injector.actions.map((a) => (a.type === 'key' ? `${a.key}:${a.action}` : a.type))).toEqual([
      'ctrl:down',
      'shift:down',
      'escape:down',
      'escape:up',
      'shift:up',
      'ctrl:up',
    ]);
    expect(injector.stillPressed()).toEqual([]);
  });

  it('heartbeat ausente 3 s suelta Ctrl y el botón del drag', async () => {
    const { ctl, injector, advance } = setup();
    current = ctl;
    await ctl.handle({ t: 'key', key: 'ctrl', action: 'down' });
    await ctl.handle({ t: 'pointer.button', button: 'left', action: 'down', x: 0.5, y: 0.5 });
    await ctl.handle({ t: 'heartbeat', ts: 1 });
    advance(2_900);
    ctl.checkHeartbeat();
    expect(ctl.pressed).toEqual({ keys: ['ctrl'], buttons: ['left'] });
    advance(200);
    ctl.checkHeartbeat();
    await vi.waitFor(() => expect(ctl.pressed).toEqual({ keys: [], buttons: [] }));
    expect(injector.stillPressed()).toEqual([]);
  });

  it('input.reset, fin de sesión y canal cerrado no dejan nada apretado', async () => {
    const { ctl, injector } = setup();
    await ctl.handle({ t: 'key', key: 'alt', action: 'down' });
    await ctl.handle({ t: 'key', key: 'tab', action: 'down' });
    await ctl.handle({ t: 'input.reset' });
    expect(injector.stillPressed()).toEqual([]);

    await ctl.handle({ t: 'key', key: 'meta', action: 'down' });
    await ctl.handle({ t: 'pointer.button', button: 'right', action: 'down', x: 0, y: 0 });
    await ctl.releaseAll();
    expect(injector.stillPressed()).toEqual([]);

    await ctl.handle({ t: 'key', key: 'shift', action: 'down' });
    await ctl.stop();
    expect(injector.stillPressed()).toEqual([]);
    // Después de cortar no se inyecta nada más.
    await ctl.handle({ t: 'key', key: 'a', action: 'tap' });
    expect(injector.actions.at(-1)).toEqual({ type: 'key', key: 'shift', action: 'up' });
  });

  it('tecla o botón "down" repetido no se duplica; "up" sin "down" no se manda', async () => {
    const { ctl, injector } = setup();
    current = ctl;
    await ctl.handle({ t: 'key', key: 'ctrl', action: 'down' });
    await ctl.handle({ t: 'key', key: 'ctrl', action: 'down' });
    await ctl.handle({ t: 'key', key: 'alt', action: 'up' });
    expect(injector.actions).toEqual([{ type: 'key', key: 'ctrl', action: 'down' }]);
  });

  it('rate limit ~500/s: la ráfaga pasa, el exceso se descarta y avisa', async () => {
    const { ctl, injector, onRateLimited } = setup();
    current = ctl;
    for (let i = 0; i < 300; i++) await ctl.handle({ t: 'pointer.move', seq: i + 1, x: 0.5, y: 0.5 });
    expect(injector.actions.length).toBe(100);
    expect(onRateLimited).toHaveBeenCalledTimes(1);
  });

  it('el heartbeat no consume rate limit', async () => {
    const { ctl, injector } = setup();
    current = ctl;
    for (let i = 0; i < 500; i++) await ctl.handle({ t: 'heartbeat', ts: i });
    await ctl.handle({ t: 'scroll', dx: 0, dy: 120 });
    expect(injector.actions).toEqual([{ type: 'scroll', dx: 0, dy: 120 }]);
  });

  it('comandos que no son input se ignoran', async () => {
    const { ctl, injector } = setup();
    current = ctl;
    await ctl.handle({ t: 'clipboard.pull' });
    await ctl.handle({ t: 'text', text: 'ñandú @ €' });
    expect(injector.actions).toEqual([{ type: 'text', text: 'ñandú @ €' }]);
  });
});
