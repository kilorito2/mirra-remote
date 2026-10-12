import { createWriteStream, linkSync, mkdirSync, readdirSync, rmSync, writeFileSync, type WriteStream } from 'node:fs';
import { extname, join } from 'node:path';
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
  written: number;
  lastAck: number;
  path: string;
  stream: WriteStream;
}

export interface FileReceiverDeps {
  dir: () => string;
  /** Mensajes de control del canal `file` hacia el celular. */
  send: (msg: FileMessage) => void;
  onProgress: (t: TransferView) => void;
  /** Espacio libre del disco de `dir`, en bytes. */
  freeBytes?: (dir: string) => number;
}

/** Margen que se deja libre en el disco además del archivo. */
const FREE_MARGIN_BYTES = 256 * 1024 * 1024;

/**
 * Celular → PC (R24): una transferencia a la vez, escrita en stream a `<nombre>.part` y movida al terminar
 * sin pisar nada. El tamaño anunciado manda: si llegan más bytes, o menos al cerrar, se descarta.
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
      case 'file.end': {
        const cur = this.current;
        if (cur?.id === msg.id) this.enqueue(cur, () => this.finish(cur));
        break;
      }
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
    this.enqueue(cur, async () => {
      await writeChunk(cur.stream, data);
      // El ack cuenta lo escrito en disco, no lo recibido: con un disco lento el celular espera.
      cur.written += data.byteLength;
      if (cur.written - cur.lastAck >= FILE_ACK_EVERY_BYTES && this.current === cur) {
        cur.lastAck = cur.written;
        this.deps.send({ t: 'file.ack', id: cur.id, received: cur.written });
      }
    });
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

  /** Para tests: espera a que se escriba todo lo encolado. */
  flushed(): Promise<void> {
    return this.chain;
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
      // Disco lleno: se rechaza antes de empezar.
      const free = this.deps.freeBytes?.(dir) ?? Number.POSITIVE_INFINITY;
      if (msg.size + FREE_MARGIN_BYTES > free) {
        this.deps.send({ t: 'file.error', id: msg.id, code: 'DISK' });
        return;
      }
      const path = uniquePath(dir, defuseName(sanitizeFileName(msg.name)));
      // 'wx': nunca pisa un archivo existente.
      const stream = createWriteStream(`${path}.part`, { flags: 'wx' });
      const name = path.split(/[\\/]/).pop() ?? msg.name;
      const cur: Incoming = { id: msg.id, name, size: msg.size, received: 0, written: 0, lastAck: 0, path, stream };
      this.current = cur;
      stream.on('error', () => {
        if (this.current === cur) this.abort('error', true, 'DISK');
      });
      this.progress('running');
    } catch {
      this.deps.send({ t: 'file.error', id: msg.id, code: 'DISK' });
    }
  }

  private async finish(cur: Incoming): Promise<void> {
    if (this.current !== cur) return;
    if (cur.received !== cur.size) {
      this.abort('error', true, 'SIZE_MISMATCH');
      return;
    }
    await new Promise<void>((resolve) => cur.stream.end(resolve));
    // Se pudo cancelar mientras se cerraba el archivo.
    if (!this.isCurrent(cur)) return;
    const final = placeExclusive(`${cur.path}.part`, cur.path);
    markFromInternet(final);
    this.current = null;
    this.deps.onProgress({ id: cur.id, name: cur.name, size: cur.size, done: cur.size, direction: 'toPc', state: 'done' });
    this.deps.send({ t: 'file.done', id: cur.id });
  }

  private isCurrent(cur: Incoming): boolean {
    return this.current === cur;
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

  /** Si falla, se aborta esa transferencia y no otra que haya empezado después. */
  private enqueue(cur: Incoming, fn: () => Promise<void>): void {
    this.chain = this.chain.then(fn).catch(() => {
      if (this.current === cur) this.abort('error', true, 'DISK');
    });
  }
}

/** Espera a que el chunk se escriba (backpressure de disco); un cierre en el medio también libera. */
function writeChunk(stream: WriteStream, data: Uint8Array): Promise<void> {
  return new Promise((resolve) => {
    if (stream.destroyed || stream.write(data)) {
      resolve();
      return;
    }
    const done = () => {
      stream.off('drain', done);
      stream.off('close', done);
      resolve();
    };
    stream.once('drain', done);
    stream.once('close', done);
  });
}

/**
 * Tipos que Windows interpreta al abrir la carpeta o ejecuta con un doble clic engañoso
 * (desktop.ini y .library-ms pueden filtrar credenciales NTLM): se les agrega `.bloqueado`.
 */
const DANGEROUS_EXT = new Set(['.library-ms', '.searchconnector-ms', '.scf', '.lnk', '.url']);
export function defuseName(name: string): string {
  const lower = name.toLowerCase();
  return lower === 'desktop.ini' || DANGEROUS_EXT.has(extname(lower)) ? `${name}.bloqueado` : name;
}

/** Mueve sin pisar: si el destino apareció mientras tanto, usa "nombre (1)". */
function placeExclusive(part: string, target: string): string {
  const ext = extname(target);
  const stem = ext ? target.slice(0, -ext.length) : target;
  for (let i = 0; i < 100; i++) {
    const candidate = i === 0 ? target : `${stem} (${i})${ext}`;
    try {
      linkSync(part, candidate);
      rmSync(part, { force: true });
      return candidate;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error('sin nombre libre');
}

/** Mark-of-the-Web: Windows trata el archivo como bajado de internet (SmartScreen, vista protegida). */
function markFromInternet(path: string): void {
  if (process.platform !== 'win32') return;
  try {
    writeFileSync(`${path}:Zone.Identifier`, '[ZoneTransfer]\r\nZoneId=3\r\n');
  } catch {
    // Discos FAT/exFAT no tienen flujos alternativos: el archivo queda sin la marca.
  }
}

/** Al arrancar: borra parciales que quedaron de una caída. */
export function cleanupPartials(dir: string): void {
  try {
    for (const f of readdirSync(dir)) if (f.endsWith('.part')) rmSync(join(dir, f), { force: true });
  } catch {
    // La carpeta todavía no existe.
  }
}
