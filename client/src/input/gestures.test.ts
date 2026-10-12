import { describe, expect, it } from 'vitest';
import { GESTURE, accelerate, initialGestureState, reduceGesture, tickGesture, type GestureAction, type GestureState, type Mode, type PointerInput } from './gestures';

/** Corre una secuencia de eventos (y ticks) y junta todas las acciones. */
function run(mode: Mode, steps: (PointerInput | { tick: number })[], start?: GestureState) {
  let state = start ?? initialGestureState(mode);
  const actions: GestureAction[] = [];
  for (const step of steps) {
    const r = 'tick' in step ? tickGesture(state, step.tick) : reduceGesture(state, step);
    state = r.state;
    actions.push(...r.actions);
  }
  return { state, actions };
}

const down = (id: number, x: number, y: number, t: number): PointerInput => ({ kind: 'down', id, x, y, t });
const move = (id: number, x: number, y: number, t: number): PointerInput => ({ kind: 'move', id, x, y, t });
const up = (id: number, x: number, y: number, t: number): PointerInput => ({ kind: 'up', id, x, y, t });

describe('trackpad', () => {
  it('arrastrar un dedo mueve el cursor en relativo', () => {
    const { actions } = run('trackpad', [down(1, 100, 100, 0), move(1, 105, 100, 16), move(1, 130, 110, 32), up(1, 130, 110, 48)]);
    expect(actions).toEqual([{ type: 'cursorDelta', dx: 30, dy: 10, dt: 32 }]);
  });

  it('tap = clic izquierdo donde está el cursor', () => {
    const { actions } = run('trackpad', [down(1, 50, 50, 0), up(1, 52, 51, 120)]);
    expect(actions).toEqual([{ type: 'click', button: 'left', count: 1 }]);
  });

  it('doble tap = doble clic', () => {
    const { actions } = run('trackpad', [down(1, 50, 50, 0), up(1, 50, 50, 80), down(1, 55, 52, 200), up(1, 55, 52, 260)]);
    expect(actions).toEqual([
      { type: 'click', button: 'left', count: 1 },
      { type: 'click', button: 'left', count: 2 },
    ]);
  });

  it('dos taps separados en el tiempo son dos clics simples', () => {
    const { actions } = run('trackpad', [down(1, 50, 50, 0), up(1, 50, 50, 80), down(1, 50, 50, 900), up(1, 50, 50, 960)]);
    expect(actions.map((a) => (a.type === 'click' ? a.count : 0))).toEqual([1, 1]);
  });

  it('tap con 2 dedos = clic derecho', () => {
    const { actions, state } = run('trackpad', [down(1, 100, 100, 0), down(2, 160, 100, 20), up(1, 100, 100, 120), up(2, 160, 100, 130)]);
    expect(actions).toEqual([{ type: 'click', button: 'right', count: 1 }]);
    expect(state.phase.kind).toBe('idle');
  });

  it('arrastrar 2 dedos = scroll natural (dedos arriba → rueda abajo)', () => {
    const { actions } = run('trackpad', [
      down(1, 100, 300, 0),
      down(2, 160, 300, 10),
      move(1, 100, 290, 30),
      move(2, 160, 290, 30),
      move(1, 100, 260, 50),
      move(2, 160, 260, 50),
    ]);
    const scrolls = actions.filter((a): a is Extract<GestureAction, { type: 'scroll' }> => a.type === 'scroll');
    expect(scrolls.length).toBeGreaterThan(0);
    const total = scrolls.reduce((sum, a) => sum + a.dy, 0);
    expect(total).toBeGreaterThan(0);
    expect(actions.some((a) => a.type === 'click')).toBe(false);
  });

  it('mantener presionado y arrastrar = arrastre con el botón apretado', () => {
    const { actions } = run('trackpad', [
      down(1, 100, 100, 0),
      { tick: GESTURE.LONG_PRESS_MS + 10 },
      move(1, 140, 100, 600),
      move(1, 180, 120, 620),
      up(1, 180, 120, 700),
    ]);
    expect(actions[0]).toEqual({ type: 'longPressArmed' });
    expect(actions[1]).toEqual({ type: 'buttonDown' });
    expect(actions.at(-1)).toEqual({ type: 'buttonUp' });
    expect(actions.filter((a) => a.type === 'cursorDelta').length).toBe(2);
  });

  it('el long press no se dispara si el dedo ya se movió', () => {
    const { actions } = run('trackpad', [down(1, 100, 100, 0), move(1, 150, 100, 100), { tick: 1000 }, up(1, 150, 100, 1100)]);
    expect(actions.some((a) => a.type === 'buttonDown')).toBe(false);
  });

  it('cancelar en medio de un arrastre suelta el botón', () => {
    const { actions } = run('trackpad', [down(1, 100, 100, 0), { tick: 500 }, { kind: 'cancel', id: 1, x: 0, y: 0, t: 600 }]);
    expect(actions.at(-1)).toEqual({ type: 'buttonUp' });
  });
});

describe('pellizco', () => {
  it('abrir dos dedos = zoom > 1 con el centro del gesto, sin scroll ni clic', () => {
    const { actions } = run('trackpad', [
      down(1, 200, 300, 0),
      down(2, 300, 300, 10),
      move(1, 170, 300, 40),
      move(2, 330, 300, 40),
      move(1, 150, 300, 60),
      move(2, 350, 300, 60),
      up(1, 150, 300, 400),
      up(2, 350, 300, 410),
    ]);
    const zooms = actions.filter((a): a is Extract<GestureAction, { type: 'zoom' }> => a.type === 'zoom');
    expect(zooms.length).toBeGreaterThan(0);
    expect(zooms.reduce((f, z) => f * z.factor, 1)).toBeGreaterThan(1);
    expect(zooms[0]?.cx).toBe(250);
    expect(actions.some((a) => a.type === 'scroll' || a.type === 'click')).toBe(false);
  });
});

describe('táctil directo', () => {
  it('tap = clic donde tocás', () => {
    const { actions } = run('direct', [down(1, 320, 180, 0), up(1, 321, 181, 90)]);
    expect(actions).toEqual([{ type: 'click', button: 'left', count: 1, x: 320, y: 180 }]);
  });

  it('doble tap clava el segundo clic en el punto del primero', () => {
    const { actions } = run('direct', [down(1, 320, 180, 0), up(1, 320, 180, 60), down(1, 330, 190, 200), up(1, 330, 190, 260)]);
    expect(actions[1]).toEqual({ type: 'click', button: 'left', count: 2, x: 320, y: 180 });
  });

  it('arrastrar = botón apretado desde el punto inicial y el cursor sigue al dedo', () => {
    const { actions } = run('direct', [down(1, 100, 100, 0), move(1, 140, 100, 30), move(1, 200, 150, 60), up(1, 200, 150, 90)]);
    expect(actions).toEqual([
      { type: 'buttonDown', x: 100, y: 100 },
      { type: 'pointTo', x: 140, y: 100 },
      { type: 'pointTo', x: 200, y: 150 },
      { type: 'buttonUp' },
    ]);
  });

  it('mantener sin mover = clic derecho en ese punto', () => {
    const { actions } = run('direct', [down(1, 50, 60, 0), { tick: 500 }, up(1, 50, 60, 700)]);
    expect(actions).toEqual([{ type: 'click', button: 'right', count: 1, x: 50, y: 60 }]);
  });
});

describe('accelerate', () => {
  it('lento = 1:1, rápido = hasta 4×', () => {
    expect(accelerate(2, 0, 16)).toEqual({ dx: 2, dy: 0 });
    expect(accelerate(80, 0, 16).dx).toBe(320);
    const mid = accelerate(16, 0, 16).dx;
    expect(mid).toBeGreaterThan(16);
    expect(mid).toBeLessThan(64);
  });
});
