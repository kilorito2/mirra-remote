import type { IncomingMessage, Server } from 'node:http';
import { isIP } from 'node:net';
import type { Duplex } from 'node:stream';
import { WebSocketServer, type RawData, type WebSocket } from 'ws';
import { MAX_BAD_MESSAGES, UNAUTH_TIMEOUT_MS, WS_MAX_PAYLOAD, WS_PATH } from '@shared/constants';
import { ClientSignal, parseJson, type ErrorCode, type ServerSignal, type SessionEndReason } from '@shared/protocol';
import { TokenBucket } from '@shared/tokenBucket';
import type { ApprovalGate } from '../auth/approval';
import { Challenge } from '../auth/challenge';
import type { DeviceStore } from '../auth/deviceStore';
import type { PairingTokens } from '../auth/pairingToken';
import type { PinManager } from '../auth/pin';
import { isAllowedRemote, normalizeIp } from './ipAllowlist';

/** Tope de conexiones sin autenticar (frena el agotamiento de recursos desde la LAN). */
export const MAX_UNAUTH_CONNECTIONS = 16;

export const CLOSE = {
  normal: 4000,
  badMessage: 4400,
  unauthTimeout: 4401,
  forbidden: 4403,
  busy: 4409,
  rateLimited: 4429,
} as const;

/** Lo que el resto de la app ve de una conexión autenticada. */
export interface SignalingPeer {
  readonly deviceId: string;
  readonly deviceName: string;
  readonly ip: string;
  send(msg: ServerSignal): void;
  close(code: number, reason: string): void;
}

export type PeerSignal = Extract<ClientSignal, { t: 'rtc.description' | 'rtc.candidate' | 'rtc.restart' | 'session.end' }>;

/** Puerto hacia la sesión (control único, relay de WebRTC). */
export interface SessionPort {
  /** false ⇒ otro dispositivo controla la PC (BUSY). */
  join(peer: SignalingPeer, resume: boolean): boolean;
  signal(peer: SignalingPeer, msg: PeerSignal): void;
  peerClosed(peer: SignalingPeer): void;
}

export interface SignalingDeps {
  tokens: PairingTokens;
  pins: PinManager;
  devices: DeviceStore;
  approval: ApprovalGate;
  session: SessionPort;
  hostName: string;
  allowLoopback: boolean;
  /** Se llama al emparejar un dispositivo nuevo (para refrescar la UI). */
  onPaired?: (deviceId: string) => void;
  /** Solo tests: acorta el timeout sin autenticar. */
  unauthTimeoutMs?: number;
}

type ConnState = 'unauth' | 'pending' | 'challenged' | 'authed' | 'closed';

export class Signaling {
  private readonly wss = new WebSocketServer({ noServer: true, maxPayload: WS_MAX_PAYLOAD, perMessageDeflate: false });
  private readonly peers = new Set<Connection>();

  constructor(private readonly deps: SignalingDeps) {}

  attach(server: Server): void {
    server.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
      if (!this.acceptUpgrade(req)) {
        socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
        socket.destroy();
        return;
      }
      this.wss.handleUpgrade(req, socket, head, (ws) => {
        this.onConnection(ws, req);
      });
    });
  }

  /** Corta todas las conexiones de un dispositivo (al revocarlo). */
  closeDevice(deviceId: string, reason: SessionEndReason): void {
    for (const conn of this.peers) {
      if (conn.deviceId === deviceId) conn.end(reason);
    }
  }

  close(): void {
    for (const conn of this.peers) conn.end('USER');
    this.wss.close();
  }

  private acceptUpgrade(req: IncomingMessage): boolean {
    const path = (req.url ?? '').split('?')[0];
    if (path !== WS_PATH) return false;
    if (!isAllowedRemote(req.socket.remoteAddress, { allowLoopback: this.deps.allowLoopback })) return false;
    // CSWSH: solo la web servida por esta misma PC puede abrir el socket.
    const host = req.headers.host;
    if (typeof host !== 'string' || !isIpOrLocalhostHost(host)) return false;
    if (req.headers.origin !== `https://${host}`) return false;
    let unauth = 0;
    for (const conn of this.peers) if (!conn.isAuthenticated) unauth++;
    return unauth < MAX_UNAUTH_CONNECTIONS;
  }

  private onConnection(ws: WebSocket, req: IncomingMessage): void {
    const ip = normalizeIp(req.socket.remoteAddress)?.address ?? 'desconocida';
    const conn = new Connection(ws, ip, this.deps, () => this.peers.delete(conn));
    this.peers.add(conn);
  }
}

class Connection implements SignalingPeer {
  private state: ConnState = 'unauth';
  private badMessages = 0;
  private readonly challenge = new Challenge();
  private readonly preAuthLimit = new TokenBucket(5, 10);
  private readonly authedLimit = new TokenBucket(100, 200);
  private unauthTimer: NodeJS.Timeout;
  private readonly approvalAbort = new AbortController();
  private joined = false;
  deviceId = '';
  deviceName = '';

  get isAuthenticated(): boolean {
    return this.state === 'authed';
  }

  constructor(
    private readonly ws: WebSocket,
    readonly ip: string,
    private readonly deps: SignalingDeps,
    private readonly onGone: () => void,
  ) {
    this.unauthTimer = setTimeout(() => {
      if (this.state !== 'authed') this.close(CLOSE.unauthTimeout, 'timeout');
    }, deps.unauthTimeoutMs ?? UNAUTH_TIMEOUT_MS);
    ws.on('message', (data, isBinary) => {
      void this.onMessage(data, isBinary);
    });
    ws.on('close', () => {
      this.cleanup();
    });
    ws.on('error', () => {
      this.close(CLOSE.badMessage, 'error');
    });
  }

  send(msg: ServerSignal): void {
    if (this.ws.readyState === this.ws.OPEN) this.ws.send(JSON.stringify(msg));
  }

  close(code: number, reason: string): void {
    if (this.state === 'closed') return;
    this.state = 'closed';
    this.ws.close(code, reason);
    this.cleanup();
  }

  end(reason: SessionEndReason): void {
    this.send({ t: 'session.ended', reason });
    this.close(CLOSE.normal, reason);
  }

  private isClosed(): boolean {
    return this.state === 'closed';
  }

  private cleanup(): void {
    this.state = 'closed';
    clearTimeout(this.unauthTimer);
    this.approvalAbort.abort();
    if (this.joined) {
      this.joined = false;
      this.deps.session.peerClosed(this);
    }
    this.onGone();
  }

  private fail(code: ErrorCode, closeCode: number | null, retryAfterMs?: number): void {
    this.send({ t: 'error', code, message: code, ...(retryAfterMs === undefined ? {} : { retryAfterMs }) });
    if (closeCode !== null) this.close(closeCode, code);
  }

  private async onMessage(data: RawData, isBinary: boolean): Promise<void> {
    if (this.state === 'closed') return;
    const limiter = this.state === 'authed' ? this.authedLimit : this.preAuthLimit;
    if (!limiter.tryTake()) {
      this.fail('RATE_LIMITED', CLOSE.rateLimited);
      return;
    }
    const msg = isBinary ? null : parseJson(ClientSignal, rawToString(data));
    if (!msg) {
      this.bad();
      return;
    }
    try {
      await this.dispatch(msg);
    } catch {
      this.fail('INTERNAL', CLOSE.badMessage);
    }
  }

  private bad(): void {
    this.badMessages += 1;
    this.fail('BAD_MESSAGE', this.badMessages >= MAX_BAD_MESSAGES ? CLOSE.badMessage : null);
  }

  private async dispatch(msg: ClientSignal): Promise<void> {
    switch (this.state) {
      case 'unauth':
        await this.onUnauth(msg);
        break;
      case 'challenged':
        await this.onChallenged(msg);
        break;
      case 'authed':
        this.onAuthed(msg);
        break;
      case 'pending':
      case 'closed':
        this.bad();
        break;
    }
  }

  private async onUnauth(msg: ClientSignal): Promise<void> {
    if (msg.t === 'pair.token') {
      if (this.deps.tokens.consume(msg.token)) await this.requestApproval(msg.deviceName);
      else this.fail('TOKEN_INVALID', CLOSE.forbidden);
    } else if (msg.t === 'pair.pin') {
      const attempt = this.deps.pins.attempt(this.ip, msg.pin);
      if (attempt.ok) await this.requestApproval(msg.deviceName);
      else if (attempt.code === 'PIN_LOCKED') this.fail('PIN_LOCKED', CLOSE.forbidden, attempt.retryAfterMs);
      else this.fail('PIN_INVALID', null);
    } else if (msg.t === 'auth.hello') {
      this.state = 'challenged';
      this.deviceId = msg.deviceId;
      this.send({ t: 'auth.challenge', nonce: this.challenge.issue(msg.deviceId) });
    } else {
      this.bad();
    }
  }

  private async onChallenged(msg: ClientSignal): Promise<void> {
    if (msg.t !== 'auth.response') {
      this.bad();
      return;
    }
    const secret = this.deps.devices.secretFor(msg.deviceId);
    const valid = await this.challenge.verify(msg.deviceId, msg.hmac, secret);
    // El dispositivo pudo ser revocado mientras se calculaba el HMAC.
    if (!valid || !this.deps.devices.has(msg.deviceId)) {
      this.fail('AUTH_FAILED', CLOSE.forbidden);
      return;
    }
    this.deps.devices.touch(msg.deviceId);
    this.authenticated(msg.deviceId, this.deps.devices.nameOf(msg.deviceId) ?? 'Dispositivo');
  }

  private onAuthed(msg: ClientSignal): void {
    if (msg.t === 'session.join') {
      if (this.deps.session.join(this, msg.resume)) this.joined = true;
      else this.fail('BUSY', CLOSE.busy);
    } else if (this.joined && (msg.t === 'rtc.description' || msg.t === 'rtc.candidate' || msg.t === 'rtc.restart' || msg.t === 'session.end')) {
      this.deps.session.signal(this, msg);
    } else {
      this.bad();
    }
  }

  private async requestApproval(deviceName: string): Promise<void> {
    this.state = 'pending';
    // El diálogo tiene su propio límite (60 s): el timeout de 15 s sin autenticar no aplica mientras espera.
    clearTimeout(this.unauthTimer);
    this.send({ t: 'pair.pending' });
    const result = await this.deps.approval.request(deviceName, this.ip, this.approvalAbort.signal);
    if (this.isClosed()) return; // se desconectó mientras tanto
    if (result !== 'approved') {
      this.unauthTimer = setTimeout(() => this.close(CLOSE.unauthTimeout, 'timeout'), this.deps.unauthTimeoutMs ?? UNAUTH_TIMEOUT_MS);
      this.fail(result === 'busy' ? 'APPROVAL_BUSY' : 'REJECTED', result === 'busy' ? CLOSE.busy : CLOSE.forbidden);
      return;
    }
    const { deviceId, deviceSecret } = this.deps.devices.create(deviceName);
    this.send({ t: 'pair.approved', deviceId, deviceSecret });
    this.deps.onPaired?.(deviceId);
    this.authenticated(deviceId, deviceName);
  }

  private authenticated(deviceId: string, deviceName: string): void {
    this.state = 'authed';
    this.deviceId = deviceId;
    this.deviceName = deviceName;
    clearTimeout(this.unauthTimer);
    this.send({ t: 'auth.ok', deviceId, hostName: this.deps.hostName.slice(0, 64) });
  }
}

function rawToString(data: RawData): string {
  if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
  if (data instanceof ArrayBuffer) return Buffer.from(data).toString('utf8');
  return data.toString('utf8');
}

/**
 * Host del request: solo IP literal (v4 o [v6]) o localhost, con puerto. Con un nombre de dominio
 * (DNS rebinding) el Origin coincidiría con el Host; así se descarta antes.
 */
export function isIpOrLocalhostHost(host: string): boolean {
  const match = /^(\[[0-9a-fA-F:.]+\]|[0-9.]+|localhost)(?::\d{1,5})?$/.exec(host);
  if (!match?.[1]) return false;
  const name = match[1].replace(/^\[|\]$/g, '');
  return name === 'localhost' || isIP(name) !== 0;
}
