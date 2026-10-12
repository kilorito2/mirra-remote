import { createWriteStream, mkdirSync, renameSync, rmSync, type WriteStream } from 'node:fs';
import { FILE_ACK_EVERY_BYTES, FILE_MAX_TO_PC_BYTES } from '@shared/constants';
import type { FileMessage } from '@shared/protocol';
import type { TransferView } from '@shared/uiState';
import { sanitizeFileName, uniquePath } from './sanitize';

type Offer = Extract<FileMessage, { t: 'file.offer' }>;

interface Incoming {
  id: string;
  name: string;
  size: number;
  received: number;
  lastAck: number;
  path: string;
  stream: WriteStream;
}

export interface FileReceiverDeps {
  dir: () => string;
  /** Mensajes de control del canal `file` hacia el celular. */
  send: (msg: FileMessage) => void;
  onProgress: (t: TransferView) => void;
}

/**
 * Celular → PC (R24): una transferencia a la vez, escrita en stream a `<nombre>.part` y renombrada al terminar.
 * El tamaño anunciado manda: si llegan más bytes, o menos al cerrar, se descarta.
 */
export class FileReceiver {
  private current: Incoming | null = null;
  private chain: Promise<void> = Promise.resolve();

  constructor(private readonly deps: FileReceiverDeps) {}

  get active(): boolean {
    return this.current !== null;
  }

  message(msg: FileMessage): void {
    switch (msg.t) {
      case 'file.offer':
        this.offer(msg);
        break;
      case 'file.end':
        if (this.current?.id === msg.id) this.enqueue(() => this.finish());
        break;
      case 'file.cancel':
        if (this.current?.id === msg.id) this.abort('cancelled', false);
        break;
      default:
        break;
    }
  }

  chunk(data: Uint8Array): void {
    const cur = this.current;
    if (!cur) return;
    if (cur.received + data.byteLength > cur.size) {
      this.abort('error', true, 'SIZE_MISMATCH');
      return;
    }
    cur.received += data.byteLength;
    this.enqueue(
      () =>
        new Promise<void>((resolve) => {
          // Backpressure de disco: se espera a que el stream drene antes de seguir con el próximo chunk.
          // Si se canceló en el medio, 'close' también libera la espera.
          if (cur.stream.destroyed || cur.stream.write(data)) resolve();
          else {
            cur.stream.once('drain', resolve);
            cur.stream.once('close', resolve);
          }
        }),
    );
    if (cur.received - cur.lastAck >= FILE_ACK_EVERY_BYTES) {
      cur.lastAck = cur.received;
      this.deps.send({ t: 'file.ack', id: cur.id, received: cur.received });
    }
    this.progress('running');
  }

  /** El canal se cerró o la sesión terminó: el parcial se borra. */
  reset(): void {
    if (this.current) this.abort('cancelled', false);
  }

  cancel(id: string): void {
    if (this.current?.id !== id) return;
    this.deps.send({ t: 'file.cancel', id, reason: 'pc' });
    this.abort('cancelled', false);
  }

  private offer(msg: Offer): void {
    if (this.current) {
      this.deps.send({ t: 'file.error', id: msg.id, code: 'BUSY' });
      return;
    }
    if (msg.size > FILE_MAX_TO_PC_BYTES) {
      this.deps.send({ t: 'file.error', id: msg.id, code: 'TOO_LARGE' });
      return;
    }
    try {
      const dir = this.deps.dir();
      mkdirSync(dir, { recursive: true });
      const path = uniquePath(dir, sanitizeFileName(msg.name));
      // 'wx': nunca pisa un archivo existente.
      const stream = createWriteStream(`${path}.part`, { flags: 'wx' });
      this.current = { id: msg.id, name: path.split(/[\\/]/).pop() ?? msg.name, size: msg.size, received: 0, lastAck: 0, path, stream };
      stream.on('error', () => this.abort('error', true, 'DISK'));
      this.progress('running');
    } catch {
      this.deps.send({ t: 'file.error', id: msg.id, code: 'DISK' });
    }
  }

  private async finish(): Promise<void> {
    const cur = this.current;
    if (!cur) return;
    if (cur.received !== cur.size) {
      this.abort('error', true, 'SIZE_MISMATCH');
      return;
    }
    await new Promise<void>((resolve) => cur.stream.end(resolve));
    renameSync(`${cur.path}.part`, cur.path);
    this.current = null;
    this.deps.onProgress({ id: cur.id, name: cur.name, size: cur.size, done: cur.size, direction: 'toPc', state: 'done' });
    this.deps.send({ t: 'file.done', id: cur.id });
  }

  private abort(state: 'cancelled' | 'error', notify: boolean, code?: 'SIZE_MISMATCH' | 'DISK'): void {
    const cur = this.current;
    if (!cur) return;
    this.current = null;
    // En Windows el archivo abierto no se puede borrar: primero se cierra el stream.
    const part = `${cur.path}.part`;
    if (cur.stream.closed) rmSync(part, { force: true });
    else cur.stream.once('close', () => rmSync(part, { force: true }));
    cur.stream.destroy();
    if (notify && code) this.deps.send({ t: 'file.error', id: cur.id, code });
    this.deps.onProgress({ id: cur.id, name: cur.name, size: cur.size, done: cur.received, direction: 'toPc', state });
  }

  private progress(state: TransferView['state']): void {
    const cur = this.current;
    if (cur) this.deps.onProgress({ id: cur.id, name: cur.name, size: cur.size, done: cur.received, direction: 'toPc', state });
  }

  private enqueue(fn: () => Promise<void>): void {
    this.chain = this.chain.then(fn).catch(() => this.abort('error', true, 'DISK'));
  }

  /** Para tests: espera a que se escriba todo lo encolado. */
  flushed(): Promise<void> {
    return this.chain;
  }
}
