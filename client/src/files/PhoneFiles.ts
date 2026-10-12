import {
  FILE_ACK_EVERY_BYTES,
  FILE_BUFFER_HIGH_BYTES,
  FILE_BUFFER_LOW_BYTES,
  FILE_CHUNK_BYTES,
  FILE_MAX_TO_PHONE_BYTES,
  FILE_MAX_UNACKED_BYTES,
} from '@shared/constants';
import { FileMessage, parseJson } from '@shared/protocol';

export interface PhoneTransfer {
  id: string;
  name: string;
  size: number;
  done: number;
  direction: 'toPc' | 'toPhone';
  state: 'running' | 'done' | 'cancelled' | 'error';
}

interface Outgoing {
  t: PhoneTransfer;
  file: Blob;
  acked: number;
  cancelled: boolean;
}

interface Incoming {
  t: PhoneTransfer;
  parts: ArrayBuffer[];
  lastAck: number;
  mime: string;
}

export interface FileChannel {
  readonly readyState: RTCDataChannelState;
  readonly bufferedAmount: number;
  bufferedAmountLowThreshold: number;
  onbufferedamountlow: ((this: RTCDataChannel, ev: Event) => unknown) | null;
  send(data: string | ArrayBuffer): void;
}

export interface PhoneFilesDeps {
  channel: () => FileChannel | undefined;
  onChange: (transfers: PhoneTransfer[]) => void;
  /** Guardar el archivo recibido (en el navegador: descarga de un Blob). */
  save: (blob: Blob, name: string) => void;
  newId?: () => string;
}

/**
 * Archivos por el canal `file` (R24, R25): una transferencia activa por sentido, chunks de 16 KiB,
 * backpressure con `bufferedAmountLowThreshold` y no más de 8 MiB sin confirmar.
 */
export class PhoneFiles {
  private outgoing: Outgoing | null = null;
  private readonly queue: { file: Blob; name: string }[] = [];
  private incoming: Incoming | null = null;
  private readonly list = new Map<string, PhoneTransfer>();
  private ackWaiter: (() => void) | null = null;

  constructor(private readonly deps: PhoneFilesDeps) {}

  get transfers(): PhoneTransfer[] {
    return [...this.list.values()];
  }

  send(file: Blob, name: string): void {
    this.queue.push({ file, name });
    void this.pump();
  }

  cancel(id: string): void {
    if (this.outgoing?.t.id === id) {
      this.outgoing.cancelled = true;
      this.msg({ t: 'file.cancel', id });
      this.finishOutgoing('cancelled');
    } else if (this.incoming?.t.id === id) {
      this.msg({ t: 'file.cancel', id });
      this.finishIncoming('cancelled');
    }
  }

  /** Mensaje del canal `file`. */
  receive(data: string | ArrayBuffer): void {
    if (typeof data !== 'string') {
      this.chunk(data);
      return;
    }
    const msg = parseJson(FileMessage, data);
    if (!msg) return;
    switch (msg.t) {
      case 'file.offer':
        this.offer(msg.id, msg.name, msg.size, msg.mime);
        break;
      case 'file.end':
        if (this.incoming?.t.id === msg.id) this.completeIncoming();
        break;
      case 'file.ack':
        if (this.outgoing?.t.id === msg.id) {
          this.outgoing.acked = Math.max(this.outgoing.acked, msg.received);
          this.outgoing.t.done = this.outgoing.acked;
          this.changed(this.outgoing.t);
          this.ackWaiter?.();
        }
        break;
      case 'file.done':
        if (this.outgoing?.t.id === msg.id) {
          this.outgoing.t.done = this.outgoing.t.size;
          this.finishOutgoing('done');
        }
        break;
      case 'file.cancel':
        if (this.outgoing?.t.id === msg.id) this.finishOutgoing('cancelled');
        if (this.incoming?.t.id === msg.id) this.finishIncoming('cancelled');
        break;
      case 'file.error':
        if (this.outgoing?.t.id === msg.id) this.finishOutgoing('error');
        break;
    }
  }

  /** El canal se cerró (corte de sesión): lo que estaba en curso queda cancelado. */
  reset(): void {
    if (this.outgoing) this.finishOutgoing('cancelled');
    if (this.incoming) this.finishIncoming('cancelled');
    this.queue.length = 0;
  }

  // ───────────── celular → PC ─────────────

  private async pump(): Promise<void> {
    if (this.outgoing) return;
    const next = this.queue.shift();
    if (!next) return;
    const id = (this.deps.newId ?? (() => crypto.randomUUID().replace(/-/g, '').slice(0, 24)))();
    const t: PhoneTransfer = { id, name: next.name, size: next.file.size, done: 0, direction: 'toPc', state: 'running' };
    const out: Outgoing = { t, file: next.file, acked: 0, cancelled: false };
    this.outgoing = out;
    this.changed(t);
    this.msg({ t: 'file.offer', id, name: next.name.slice(0, 255), size: next.file.size, mime: next.file.type.slice(0, 128) });
    let offset = 0;
    try {
      while (offset < next.file.size && !out.cancelled) {
        await this.room(out, offset);
        // Se pudo cancelar mientras se esperaba lugar.
        if (isCancelled(out)) break;
        const chunk = await next.file.slice(offset, offset + FILE_CHUNK_BYTES).arrayBuffer();
        const ch = this.deps.channel();
        if (ch?.readyState !== 'open') throw new Error('canal cerrado');
        ch.send(chunk);
        offset += chunk.byteLength;
      }
      if (!out.cancelled) this.msg({ t: 'file.end', id });
    } catch {
      if (this.outgoing === out) this.finishOutgoing('error');
    }
  }

  /** Espera a que haya lugar: buffer del canal bajo 4 MiB y menos de 8 MiB sin ack. */
  private async room(out: Outgoing, offset: number): Promise<void> {
    for (;;) {
      const ch = this.deps.channel();
      if (!ch || ch.readyState !== 'open' || out.cancelled) return;
      const unacked = offset - out.acked;
      if (ch.bufferedAmount < FILE_BUFFER_HIGH_BYTES && unacked < FILE_MAX_UNACKED_BYTES) return;
      await new Promise<void>((resolve) => {
        const done = () => {
          ch.onbufferedamountlow = null;
          this.ackWaiter = null;
          resolve();
        };
        ch.bufferedAmountLowThreshold = FILE_BUFFER_LOW_BYTES;
        ch.onbufferedamountlow = done;
        this.ackWaiter = done;
        setTimeout(done, 500);
      });
    }
  }

  private finishOutgoing(state: PhoneTransfer['state']): void {
    const out = this.outgoing;
    if (!out) return;
    out.cancelled = true;
    out.t.state = state;
    this.outgoing = null;
    this.changed(out.t);
    void this.pump();
  }

  // ───────────── PC → celular ─────────────

  private offer(id: string, name: string, size: number, mime: string): void {
    if (this.incoming) {
      this.msg({ t: 'file.error', id, code: 'BUSY' });
      return;
    }
    if (size > FILE_MAX_TO_PHONE_BYTES) {
      this.msg({ t: 'file.error', id, code: 'TOO_LARGE' });
      return;
    }
    const t: PhoneTransfer = { id, name, size, done: 0, direction: 'toPhone', state: 'running' };
    this.incoming = { t, parts: [], lastAck: 0, mime };
    this.changed(t);
  }

  private chunk(data: ArrayBuffer): void {
    const inc = this.incoming;
    if (!inc) return;
    if (inc.t.done + data.byteLength > inc.t.size) {
      this.msg({ t: 'file.error', id: inc.t.id, code: 'SIZE_MISMATCH' });
      this.finishIncoming('error');
      return;
    }
    inc.parts.push(data);
    inc.t.done += data.byteLength;
    if (inc.t.done - inc.lastAck >= FILE_ACK_EVERY_BYTES) {
      inc.lastAck = inc.t.done;
      this.msg({ t: 'file.ack', id: inc.t.id, received: inc.t.done });
    }
    this.changed(inc.t);
  }

  private completeIncoming(): void {
    const inc = this.incoming;
    if (!inc) return;
    if (inc.t.done !== inc.t.size) {
      this.msg({ t: 'file.error', id: inc.t.id, code: 'SIZE_MISMATCH' });
      this.finishIncoming('error');
      return;
    }
    this.deps.save(new Blob(inc.parts, { type: inc.mime || 'application/octet-stream' }), inc.t.name);
    this.msg({ t: 'file.done', id: inc.t.id });
    this.finishIncoming('done');
  }

  private finishIncoming(state: PhoneTransfer['state']): void {
    const inc = this.incoming;
    if (!inc) return;
    inc.t.state = state;
    inc.parts = [];
    this.incoming = null;
    this.changed(inc.t);
  }

  private msg(m: FileMessage): void {
    const ch = this.deps.channel();
    if (ch?.readyState === 'open') ch.send(JSON.stringify(m));
  }

  private changed(t: PhoneTransfer): void {
    this.list.set(t.id, { ...t });
    while (this.list.size > 8) {
      const oldest = this.list.keys().next().value;
      if (oldest === undefined) break;
      this.list.delete(oldest);
    }
    this.deps.onChange(this.transfers);
  }
}

function isCancelled(out: Outgoing): boolean {
  return out.cancelled;
}

/** Descarga un Blob en el navegador (Android lo deja en Descargas; iOS lo abre para guardar). */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
