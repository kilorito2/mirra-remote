import { CURSOR_POS_INTERVAL_MS } from '@shared/constants';
import { physicalToNormalized, type Rect } from '@shared/coords';
import type { HostInput } from '@shared/hostIpc';
import type { ControlFromPc, InputFastFromPc } from '@shared/protocol';
import type { InputInjector } from '../ports/InputInjector';
import { TokenBucket } from '@shared/tokenBucket';
import { InputController } from './InputController';

const INPUT_TYPES = new Set<HostInput['t']>([
  'pointer.move',
  'pointer.button',
  'scroll',
  'key',
  'combo',
  'text',
  'input.reset',
  'heartbeat',
]);

type InputMessage = Extract<HostInput, { t: 'pointer.move' | 'pointer.button' | 'scroll' | 'key' | 'combo' | 'text' | 'input.reset' | 'heartbeat' }>;
export type PhoneCommand = Exclude<HostInput, InputMessage>;

function isInputMessage(msg: HostInput): msg is InputMessage {
  return INPUT_TYPES.has(msg.t);
}

export interface PhoneLinkDeps {
  injector: InputInjector;
  displayRect: () => Rect;
  sendFast: (msg: InputFastFromPc) => void;
  sendControl: (msg: ControlFromPc) => void;
  onCommand: (cmd: PhoneCommand) => void;
}

/**
 * Enlace con el celular durante una sesión: el input va al InputController, los comandos a la app,
 * y el cursor real de la PC vuelve al celular (≤ 30 Hz, solo si cambió) para el trackpad y el zoom.
 */
export class PhoneLink {
  readonly input: InputController;
  private cursorTimer: NodeJS.Timeout | null = null;
  private lastCursor = '';
  private readonly commands = new TokenBucket(10, 20);

  constructor(private readonly deps: PhoneLinkDeps) {
    this.input = new InputController({
      injector: deps.injector,
      displayRect: deps.displayRect,
      onRateLimited: () => deps.sendControl({ t: 'notice', level: 'warn', code: 'RATE_LIMITED' }),
    });
  }

  sessionStarted(): void {
    this.input.start();
  }

  async sessionEnded(): Promise<void> {
    this.stopCursor();
    await this.input.stop();
  }

  handle(msg: HostInput): void {
    if (isInputMessage(msg)) void this.input.handle(msg);
    // Los comandos (calidad, pantalla, portapapeles) escriben ajustes o recapturan: límite propio.
    else if (this.commands.tryTake()) this.deps.onCommand(msg);
  }

  channelChanged(label: 'input-fast' | 'control' | 'file', open: boolean): void {
    if (label === 'file') return;
    if (!open) {
      // R21: canal de input cerrado ⇒ no puede quedar nada apretado.
      this.stopCursor();
      void this.input.releaseAll();
    } else if (label === 'input-fast') {
      this.startCursor();
    }
  }

  hostGone(): void {
    this.stopCursor();
    void this.input.releaseAll();
  }

  private startCursor(): void {
    this.stopCursor();
    this.lastCursor = '';
    this.cursorTimer = setInterval(() => {
      void this.deps.injector.cursorPosition().then((pos) => {
        const n = physicalToNormalized(pos, this.deps.displayRect());
        const key = `${n.x.toFixed(4)},${n.y.toFixed(4)},${n.inside}`;
        if (key === this.lastCursor) return;
        this.lastCursor = key;
        this.deps.sendFast({ t: 'cursor.pos', x: n.x, y: n.y, visible: n.inside });
      });
    }, CURSOR_POS_INTERVAL_MS);
  }

  private stopCursor(): void {
    if (this.cursorTimer) clearInterval(this.cursorTimer);
    this.cursorTimer = null;
  }
}
