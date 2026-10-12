import type { ServerSignal, SessionEndReason } from '@shared/protocol';
import type { PeerSignal, SessionPort, SignalingPeer } from '../server/signaling';
import { CLOSE } from '../server/signaling';

/** Lado PC de WebRTC (renderer host). En la Fase 1 es un stub. */
export interface HostBridge {
  start(opts: { resume: boolean }): void;
  signal(msg: Exclude<PeerSignal, { t: 'session.end' }>): void;
  stop(): void;
  /** true si la conexión WebRTC sigue viva (permite reconectar el WS sin cortar). */
  isPeerConnected(): boolean;
}

export type SessionStatus =
  | { status: 'idle' }
  | { status: 'active'; deviceId: string; deviceName: string; ip: string; since: number };

export interface SessionListener {
  onStatus(status: SessionStatus): void;
  onEnded(reason: SessionEndReason): void;
}

/** Cuánto se espera a que el celular reabra el WS mientras WebRTC sigue conectado. */
export const WS_GRACE_MS = 60_000;

/** Control único: una sola sesión activa; el mismo dispositivo puede reemplazar su conexión. */
export class SessionManager implements SessionPort {
  private active: { peer: SignalingPeer | null; deviceId: string; deviceName: string; ip: string; since: number } | null = null;
  private graceTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly host: HostBridge,
    private readonly listener: SessionListener,
    private readonly clock: () => number = () => Date.now(),
  ) {}

  get status(): SessionStatus {
    const a = this.active;
    return a ? { status: 'active', deviceId: a.deviceId, deviceName: a.deviceName, ip: a.ip, since: a.since } : { status: 'idle' };
  }

  join(peer: SignalingPeer, resume: boolean): boolean {
    const a = this.active;
    if (a && a.deviceId !== peer.deviceId) return false;
    if (a?.peer === peer) return true; // join repetido en el mismo socket
    this.clearGrace();
    if (a) {
      const previous = a.peer;
      a.peer = peer;
      a.ip = peer.ip;
      if (previous && previous !== peer) {
        previous.send({ t: 'session.ended', reason: 'REPLACED' });
        previous.close(CLOSE.normal, 'REPLACED');
      }
      this.host.start({ resume: resume && this.host.isPeerConnected() });
    } else {
      this.active = { peer, deviceId: peer.deviceId, deviceName: peer.deviceName, ip: peer.ip, since: this.clock() };
      this.host.start({ resume: false });
    }
    this.listener.onStatus(this.status);
    return true;
  }

  signal(peer: SignalingPeer, msg: PeerSignal): void {
    if (this.active?.peer !== peer) return;
    if (msg.t === 'session.end') {
      this.end('USER');
      return;
    }
    this.host.signal(msg);
  }

  peerClosed(peer: SignalingPeer): void {
    const a = this.active;
    if (a?.peer !== peer) return;
    a.peer = null;
    if (!this.host.isPeerConnected()) {
      this.end('TIMEOUT');
      return;
    }
    this.graceTimer = setTimeout(() => this.end('TIMEOUT'), WS_GRACE_MS);
  }

  /** Mensajes del renderer host hacia el celular. */
  sendToPeer(msg: ServerSignal): void {
    this.active?.peer?.send(msg);
  }

  /** WebRTC se cayó y no se recuperó: si tampoco hay WS, se corta. */
  hostDisconnected(): void {
    if (this.active && !this.active.peer) this.end('TIMEOUT');
  }

  isActiveDevice(deviceId: string): boolean {
    return this.active?.deviceId === deviceId;
  }

  end(reason: SessionEndReason): void {
    const a = this.active;
    if (!a) return;
    this.active = null;
    this.clearGrace();
    this.host.stop();
    if (a.peer) {
      a.peer.send({ t: 'session.ended', reason });
      a.peer.close(CLOSE.normal, reason);
    }
    this.listener.onStatus(this.status);
    this.listener.onEnded(reason);
  }

  private clearGrace(): void {
    if (this.graceTimer) clearTimeout(this.graceTimer);
    this.graceTimer = null;
  }
}
