import { HEARTBEAT_TIMEOUT_MS, INPUT_BURST, INPUT_RATE_PER_SEC } from '@shared/constants';
import { normalizedToPhysical, type Rect } from '@shared/coords';
import type { HostInput } from '@shared/hostIpc';
import type { KeyName, MouseButton } from '@shared/protocol';
import { TokenBucket } from '@shared/tokenBucket';
import type { InputInjector } from '../ports/InputInjector';

export interface InputControllerDeps {
  injector: InputInjector;
  /** Rectángulo físico del display que se está transmitiendo. */
  displayRect: () => Rect;
  clock?: () => number;
  /** Se descartaron mensajes por rate limit (se avisa una vez por ráfaga). */
  onRateLimited?: () => void;
  watchdogIntervalMs?: number;
}

const HALF_SEQ = 0x8000_0000;

/**
 * Único cliente del InputInjector (ADR-0005). Garantías:
 * - coordenadas siempre dentro del display elegido (clamp);
 * - ~500 msg/s sostenidos (token bucket);
 * - movimientos viejos del canal desordenado se descartan por `seq`;
 * - lo apretado se registra y se suelta ante heartbeat ausente 3 s, `input.reset`, cierre de canal o fin de sesión.
 */
export class InputController {
  private readonly keys = new Set<KeyName>();
  private readonly buttons = new Set<MouseButton>();
  private readonly bucket: TokenBucket;
  private readonly clock: () => number;
  private lastSeq: number | null = null;
  private lastHeartbeat = 0;
  private active = false;
  private watchdog: NodeJS.Timeout | null = null;
  private queue: Promise<void> = Promise.resolve();
  private limited = false;

  constructor(private readonly deps: InputControllerDeps) {
    this.clock = deps.clock ?? (() => Date.now());
    this.bucket = new TokenBucket(INPUT_RATE_PER_SEC, INPUT_BURST, this.clock);
  }

  get pressed(): { keys: KeyName[]; buttons: MouseButton[] } {
    return { keys: [...this.keys], buttons: [...this.buttons] };
  }

  start(): void {
    this.active = true;
    this.lastSeq = null;
    this.lastHeartbeat = this.clock();
    this.stopWatchdog();
    this.watchdog = setInterval(() => this.checkHeartbeat(), this.deps.watchdogIntervalMs ?? 500);
  }

  /** Fin de sesión: suelta todo y deja de aceptar input. */
  async stop(): Promise<void> {
    this.active = false;
    this.stopWatchdog();
    await this.enqueue(() => this.releaseAllNow());
  }

  handle(msg: HostInput): Promise<void> {
    if (!this.active) return Promise.resolve();
    if (msg.t === 'heartbeat') {
      this.lastHeartbeat = this.clock();
      return Promise.resolve();
    }
    if (!this.bucket.tryTake()) {
      if (!this.limited) this.deps.onRateLimited?.();
      this.limited = true;
      return Promise.resolve();
    }
    this.limited = false;
    return this.enqueue(() => this.apply(msg));
  }

  /** Canal `control` o `input-fast` cerrado, o el host se cayó. */
  releaseAll(): Promise<void> {
    return this.enqueue(() => this.releaseAllNow());
  }

  /** Para tests: fuerza una pasada del watchdog. */
  checkHeartbeat(): void {
    if (!this.active) return;
    if (this.clock() - this.lastHeartbeat < HEARTBEAT_TIMEOUT_MS) return;
    if (this.keys.size || this.buttons.size) void this.releaseAll();
  }

  private enqueue(fn: () => Promise<void>): Promise<void> {
    this.queue = this.queue.then(fn).catch((err: unknown) => {
      console.error('[kr] input', err);
    });
    return this.queue;
  }

  private async apply(msg: HostInput): Promise<void> {
    // Lo encolado antes de un stop() no se inyecta después.
    if (!this.active && msg.t !== 'input.reset') return;
    const inj = this.deps.injector;
    switch (msg.t) {
      case 'pointer.move':
        if (!this.acceptSeq(msg.seq)) return;
        await inj.moveTo(this.map(msg.x, msg.y));
        return;
      case 'pointer.button':
        // Cada clic trae su coordenada: no depende de que haya llegado el último pointer.move.
        await inj.moveTo(this.map(msg.x, msg.y));
        if (msg.action === 'down') await this.buttonDown(msg.button);
        else if (msg.action === 'up') await this.buttonUp(msg.button);
        else {
          await this.buttonUp(msg.button);
          await this.buttonDown(msg.button);
          await this.buttonUp(msg.button);
        }
        return;
      case 'scroll':
        await inj.scroll(msg.dx, msg.dy);
        return;
      case 'key':
        if (msg.action === 'down') await this.keyDown(msg.key);
        else if (msg.action === 'up') await this.keyUp(msg.key);
        else {
          await this.keyUp(msg.key);
          await this.keyDown(msg.key);
          await this.keyUp(msg.key);
        }
        return;
      case 'combo':
        try {
          for (const k of msg.keys) await this.keyDown(k);
        } finally {
          for (const k of [...msg.keys].reverse()) await this.keyUp(k);
        }
        return;
      case 'text':
        await inj.typeText(msg.text);
        return;
      case 'input.reset':
        await this.releaseAllNow();
        return;
      default:
        // Comandos (clipboard, display, calidad…) no son input: los maneja otro módulo.
        return;
    }
  }

  private map(x: number, y: number) {
    return normalizedToPhysical({ x, y }, this.deps.displayRect());
  }

  /** `input-fast` es desordenado: solo avanza. Tolera el wrap de 32 bits. */
  private acceptSeq(seq: number): boolean {
    const last = this.lastSeq;
    if (last !== null) {
      const diff = (seq - last + 0x1_0000_0000) % 0x1_0000_0000;
      if (diff === 0 || diff >= HALF_SEQ) return false;
    }
    this.lastSeq = seq;
    return true;
  }

  private async keyDown(k: KeyName): Promise<void> {
    if (this.keys.has(k)) return;
    // Ctrl+Alt+Supr armado con teclas sueltas tampoco se manda (la SAS requiere el servicio nativo).
    if ((k === 'delete' || k === 'end') && this.keys.has('ctrl') && this.keys.has('alt')) return;
    this.keys.add(k);
    await this.deps.injector.key(k, 'down');
  }

  private async keyUp(k: KeyName): Promise<void> {
    if (!this.keys.delete(k)) return;
    await this.deps.injector.key(k, 'up');
  }

  private async buttonDown(b: MouseButton): Promise<void> {
    if (this.buttons.has(b)) return;
    this.buttons.add(b);
    await this.deps.injector.button(b, 'down');
  }

  private async buttonUp(b: MouseButton): Promise<void> {
    if (!this.buttons.delete(b)) return;
    await this.deps.injector.button(b, 'up');
  }

  private async releaseAllNow(): Promise<void> {
    // Primero los modificadores al final: se sueltan en orden inverso al que se apretaron.
    for (const k of [...this.keys].reverse()) await this.keyUp(k);
    for (const b of [...this.buttons]) await this.buttonUp(b);
  }

  private stopWatchdog(): void {
    if (this.watchdog) clearInterval(this.watchdog);
    this.watchdog = null;
  }
}
