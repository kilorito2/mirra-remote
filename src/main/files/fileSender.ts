import { randomBytes } from 'node:crypto';
import { createReadStream, statSync, type ReadStream } from 'node:fs';
import { basename } from 'node:path';
import { FILE_IPC_READ_BYTES, FILE_MAX_TO_PHONE_BYTES, FILE_MAX_UNACKED_BYTES } from '@shared/constants';
import type { FileMessage } from '@shared/protocol';
import type { TransferView } from '@shared/uiState';

interface Outgoing {
  id: string;
  name: string;
  size: number;
  sent: number;
  acked: number;
  stream: ReadStream | null;
}

export interface FileSenderDeps {
  send: (msg: FileMessage) => void;
  sendChunk: (data: Uint8Array) => void;
  onProgress: (t: TransferView) => void;
}

export type SendResult = { ok: true; id: string } | { ok: false; reason: 'TOO_LARGE' | 'NOT_FOUND' | 'BUSY' };

/**
 * PC → celular (R25): se lee en bloques y se manda mientras lo no confirmado sea < 8 MiB.
 * El celular confirma cada 1 MiB (file.ack); así un archivo grande no llena la memoria de nadie.
 */
export class FileSender {
  private current: Outgoing | null = null;
  private readonly queue: string[] = [];

  constructor(private readonly deps: FileSenderDeps) {}

  enqueue(path: string): SendResult {
    let size: number;
    try {
      const st = statSync(path);
      if (!st.isFile()) return { ok: false, reason: 'NOT_FOUND' };
      size = st.size;
    } catch {
      return { ok: false, reason: 'NOT_FOUND' };
    }
    if (size > FILE_MAX_TO_PHONE_BYTES) return { ok: false, reason: 'TOO_LARGE' };
    if (this.queue.length > 20) return { ok: false, reason: 'BUSY' };
    this.queue.push(path);
    const id = this.current?.id ?? '';
    this.next();
    return { ok: true, id: this.current?.id ?? id };
  }

  message(msg: FileMessage): void {
    const cur = this.current;
    if (!cur || !('id' in msg) || msg.id !== cur.id) return;
    switch (msg.t) {
      case 'file.ack':
        cur.acked = Math.max(cur.acked, Math.min(msg.received, cur.sent));
        if (cur.stream?.isPaused() && cur.sent - cur.acked < FILE_MAX_UNACKED_BYTES) cur.stream.resume();
        break;
      case 'file.done':
        this.deps.onProgress(this.view(cur, 'done'));
        this.current = null;
        this.next();
        break;
      case 'file.cancel':
      case 'file.error':
        this.stop(cur, msg.t === 'file.error' ? 'error' : 'cancelled', false);
        break;
      default:
        break;
    }
  }

  cancel(id: string): void {
    if (this.current?.id === id) this.stop(this.current, 'cancelled', true);
  }

  /** Canal cerrado o fin de sesión. */
  reset(): void {
    this.queue.length = 0;
    if (this.current) this.stop(this.current, 'cancelled', false);
  }

  private next(): void {
    if (this.current) return;
    const path = this.queue.shift();
    if (!path) return;
    let size: number;
    try {
      size = statSync(path).size;
    } catch {
      this.next();
      return;
    }
    const cur: Outgoing = { id: randomBytes(9).toString('base64url'), name: basename(path), size, sent: 0, acked: 0, stream: null };
    this.current = cur;
    this.deps.send({ t: 'file.offer', id: cur.id, name: cur.name.slice(0, 255), size, mime: '' });
    this.deps.onProgress(this.view(cur, 'running'));
    const stream = createReadStream(path, { highWaterMark: FILE_IPC_READ_BYTES });
    cur.stream = stream;
    stream.on('data', (chunk) => {
      const data = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      cur.sent += data.byteLength;
      this.deps.sendChunk(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
      this.deps.onProgress(this.view(cur, 'running'));
      if (cur.sent - cur.acked >= FILE_MAX_UNACKED_BYTES) stream.pause();
    });
    stream.on('end', () => this.deps.send({ t: 'file.end', id: cur.id }));
    stream.on('error', () => this.stop(cur, 'error', true));
  }

  private stop(cur: Outgoing, state: 'cancelled' | 'error', notify: boolean): void {
    cur.stream?.destroy();
    if (notify) this.deps.send({ t: 'file.cancel', id: cur.id, reason: 'pc' });
    this.deps.onProgress(this.view(cur, state));
    if (this.current === cur) this.current = null;
    this.next();
  }

  private view(cur: Outgoing, state: TransferView['state']): TransferView {
    return { id: cur.id, name: cur.name, size: cur.size, done: Math.min(cur.acked > 0 ? cur.acked : cur.sent, cur.size), direction: 'toPhone', state };
  }
}
