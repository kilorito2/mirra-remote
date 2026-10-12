import { HEARTBEAT_INTERVAL_MS, SCROLL_MAX } from '@shared/constants';
import type { Pt } from './surface';
import type { ControlFromPhone, InputFastFromPhone, KeyName, MouseButton } from '@shared/protocol';

export interface InputTransport {
  sendInputFast(msg: InputFastFromPhone): boolean;
  sendControl(msg: ControlFromPhone): boolean;
}

/** px de dedo → unidades WHEEL_DELTA (120 = una muesca ≈ 50 px de dedo). */
const WHEEL_PER_PX = 2.4;

/**
 * Traduce acciones a mensajes del protocolo: `seq` para el canal desordenado, scroll acumulado
 * a enteros, heartbeat cada 1 s y `input.reset` al perder el foco.
 */
export class InputSender {
  private seq = 0;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private scrollAcc = { x: 0, y: 0 };
  private scrollFrame: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly transport: InputTransport) {}

  start(): void {
    this.stop();
    this.heartbeat = setInterval(() => {
      this.transport.sendControl({ t: 'heartbeat', ts: Date.now() });
    }, HEARTBEAT_INTERVAL_MS);
  }

  stop(): void {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = null;
  }

  move(p: Pt): void {
    this.seq = (this.seq + 1) >>> 0;
    this.transport.sendInputFast({ t: 'pointer.move', seq: this.seq, x: p.x, y: p.y });
  }

  click(button: MouseButton, p: Pt): void {
    this.transport.sendControl({ t: 'pointer.button', button, action: 'click', x: p.x, y: p.y });
  }

  button(button: MouseButton, action: 'down' | 'up', p: Pt): void {
    this.transport.sendControl({ t: 'pointer.button', button, action, x: p.x, y: p.y });
  }

  /** Se acumula y se manda como mucho cada 16 ms, en enteros (el protocolo no acepta fracciones). */
  scroll(dxPx: number, dyPx: number): void {
    this.scrollAcc.x += dxPx * WHEEL_PER_PX;
    this.scrollAcc.y += dyPx * WHEEL_PER_PX;
    this.scheduleScroll();
  }

  private scheduleScroll(): void {
    if (this.scrollFrame) return;
    this.scrollFrame = setTimeout(() => {
      this.scrollFrame = null;
      const dx = Math.max(-SCROLL_MAX, Math.min(SCROLL_MAX, Math.trunc(this.scrollAcc.x)));
      const dy = Math.max(-SCROLL_MAX, Math.min(SCROLL_MAX, Math.trunc(this.scrollAcc.y)));
      this.scrollAcc.x -= dx;
      this.scrollAcc.y -= dy;
      if (dx || dy) this.transport.sendControl({ t: 'scroll', dx, dy });
      // Un gesto muy rápido supera el máximo por mensaje: el resto sale en los próximos frames.
      if (Math.abs(this.scrollAcc.x) >= SCROLL_MAX || Math.abs(this.scrollAcc.y) >= SCROLL_MAX) this.scheduleScroll();
    }, 16);
  }

  key(key: KeyName, action: 'down' | 'up' | 'tap' = 'tap'): void {
    this.transport.sendControl({ t: 'key', key, action });
  }

  combo(keys: KeyName[]): void {
    this.transport.sendControl({ t: 'combo', keys });
  }

  text(text: string): void {
    // El protocolo limita a 1000 caracteres por mensaje.
    for (let i = 0; i < text.length; i += 1000) this.transport.sendControl({ t: 'text', text: text.slice(i, i + 1000) });
  }

  backspaces(n: number): void {
    for (let i = 0; i < n; i++) this.key('backspace');
  }

  /** El celular perdió el foco o el gesto se canceló: la PC suelta todo. */
  reset(): void {
    this.transport.sendControl({ t: 'input.reset' });
  }
}
