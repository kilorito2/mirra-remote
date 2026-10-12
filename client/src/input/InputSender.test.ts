import { afterEach, describe, expect, it, vi } from 'vitest';
import { ControlFromPhone, InputFastFromPhone } from '@shared/protocol';
import { InputSender } from './InputSender';

function setup() {
  const fast: unknown[] = [];
  const control: unknown[] = [];
  const sender = new InputSender({
    sendInputFast: (m) => fast.push(InputFastFromPhone.parse(m)) > 0,
    sendControl: (m) => control.push(ControlFromPhone.parse(m)) > 0,
  });
  return { sender, fast, control };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('InputSender', () => {
  it('seq creciente en el canal rápido; mensajes válidos según el protocolo', () => {
    const { sender, fast } = setup();
    sender.move({ x: 0.1, y: 0.2 });
    sender.move({ x: 0.3, y: 0.4 });
    expect(fast).toEqual([
      { t: 'pointer.move', seq: 1, x: 0.1, y: 0.2 },
      { t: 'pointer.move', seq: 2, x: 0.3, y: 0.4 },
    ]);
  });

  it('scroll acumulado en enteros y acotado', () => {
    vi.useFakeTimers();
    const { sender, control } = setup();
    sender.scroll(0, 0.2);
    sender.scroll(0, 0.2);
    vi.advanceTimersByTime(20);
    expect(control).toEqual([]); // menos de una unidad: se acumula
    sender.scroll(0, 1000);
    vi.advanceTimersByTime(20);
    expect(control).toEqual([{ t: 'scroll', dx: 0, dy: 1200 }]);
    vi.advanceTimersByTime(100);
    const total = control.reduce<number>((sum, m) => sum + (m as { dy: number }).dy, 0);
    expect(total).toBe(2400);
  });

  it('heartbeat cada segundo mientras dura la sesión', () => {
    vi.useFakeTimers();
    const { sender, control } = setup();
    sender.start();
    vi.advanceTimersByTime(3100);
    sender.stop();
    vi.advanceTimersByTime(3000);
    expect(control.filter((m) => (m as { t: string }).t === 'heartbeat')).toHaveLength(3);
  });

  it('texto largo se parte en mensajes de 1000', () => {
    const { sender, control } = setup();
    sender.text('x'.repeat(2500));
    expect(control).toHaveLength(3);
  });
});
