import { computeAuthHmac } from '@shared/authHmac';
import { PROTOCOL_VERSION, WS_PATH } from '@shared/constants';
import { ServerSignal, parseJson, type ClientSignal, type ErrorCode, type SessionEndReason } from '@shared/protocol';
import { clearCredentials, loadCredentials, saveCredentials, type Credentials } from './credentials';

export type Phase =
  | { kind: 'connecting' }
  | { kind: 'needPairing'; reason: PairingReason | null }
  | { kind: 'pendingApproval' }
  | { kind: 'authenticating' }
  | { kind: 'ready'; hostName: string }
  | { kind: 'busy' }
  | { kind: 'ended'; reason: SessionEndReason }
  | { kind: 'offline'; retryInMs: number };

export type PairingReason =
  | { code: 'TOKEN_INVALID' }
  | { code: 'PIN_INVALID' }
  | { code: 'PIN_LOCKED'; retryAfterMs: number }
  | { code: 'REJECTED' }
  | { code: 'APPROVAL_BUSY' }
  | { code: 'FORGOTTEN' };

export type RtcFromPc = Extract<ServerSignal, { t: 'rtc.description' | 'rtc.candidate' }>;

export interface SignalingOptions {
  url?: string;
  deviceName: string;
  token: string | null;
  onPhase: (phase: Phase) => void;
  onRtc?: (msg: RtcFromPc) => void;
  /** true si todavía hay un RTCPeerConnection vivo (para `session.join{resume}`). */
  hasLivePeer?: () => boolean;
  storage?: Storage;
  createSocket?: (url: string) => WebSocket;
}

const RETRY_STEPS_MS = [500, 1_000, 2_000, 4_000, 8_000];

/**
 * Signaling del celular: emparejamiento (QR/PIN), challenge-response y reconexión automática.
 * Expone fases simples para la UI.
 */
export class SignalingClient {
  private ws: WebSocket | null = null;
  private token: string | null;
  private pendingPin: string | null = null;
  private creds: Credentials | null;
  private attempt = 0;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private phase: Phase = { kind: 'connecting' };
  private readonly url: string;
  private deviceName: string;

  constructor(private readonly opts: SignalingOptions) {
    this.token = opts.token;
    this.deviceName = opts.deviceName;
    this.creds = loadCredentials(opts.storage);
    this.url = opts.url ?? `wss://${location.host}${WS_PATH}`;
  }

  get current(): Phase {
    return this.phase;
  }

  get isPaired(): boolean {
    return this.creds !== null;
  }

  connect(): void {
    this.stopped = false;
    this.clearRetry();
    this.setPhase({ kind: 'connecting' });
    const ws = (this.opts.createSocket ?? ((u) => new WebSocket(u)))(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.attempt = 0;
      this.begin();
    };
    ws.onmessage = (ev: MessageEvent) => {
      if (typeof ev.data !== 'string') return;
      const msg = parseJson(ServerSignal, ev.data);
      if (msg) void this.onMessage(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.onClosed();
    };
  }

  setDeviceName(name: string): void {
    this.deviceName = name;
  }

  pairWithPin(pin: string): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.send({ t: 'pair.pin', v: PROTOCOL_VERSION, pin, deviceName: this.deviceName });
      return;
    }
    // El socket se cierra tras un bloqueo o rechazo: el PIN sale apenas reconecta.
    this.pendingPin = pin;
    this.connect();
  }

  send(msg: ClientSignal): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
  }

  /** Corte pedido por el usuario: avisa a la PC y no reconecta. */
  end(): void {
    this.send({ t: 'session.end' });
    this.stop();
    this.setPhase({ kind: 'ended', reason: 'USER' });
  }

  stop(): void {
    this.stopped = true;
    this.clearRetry();
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  /** Después de un corte que no reconecta solo (sesión terminada, ocupado). */
  retryNow(): void {
    this.attempt = 0;
    this.connect();
  }

  private begin(): void {
    if (this.pendingPin) {
      this.send({ t: 'pair.pin', v: PROTOCOL_VERSION, pin: this.pendingPin, deviceName: this.deviceName });
      this.pendingPin = null;
    } else if (this.token) {
      this.send({ t: 'pair.token', v: PROTOCOL_VERSION, token: this.token, deviceName: this.deviceName });
      this.token = null; // un solo uso, también del lado del celular
      this.setPhase({ kind: 'pendingApproval' });
    } else if (this.creds) {
      this.send({ t: 'auth.hello', v: PROTOCOL_VERSION, deviceId: this.creds.deviceId });
      this.setPhase({ kind: 'authenticating' });
    } else {
      this.setPhase({ kind: 'needPairing', reason: null });
    }
  }

  private async onMessage(msg: ServerSignal): Promise<void> {
    switch (msg.t) {
      case 'pair.pending':
        this.setPhase({ kind: 'pendingApproval' });
        break;
      case 'pair.approved':
        this.creds = { deviceId: msg.deviceId, deviceSecret: msg.deviceSecret };
        saveCredentials(this.creds, this.opts.storage);
        break;
      case 'auth.challenge': {
        const creds = this.creds;
        if (!creds) return;
        this.send({ t: 'auth.response', deviceId: creds.deviceId, hmac: await computeAuthHmac(creds.deviceSecret, msg.nonce) });
        break;
      }
      case 'auth.ok':
        this.setPhase({ kind: 'ready', hostName: msg.hostName });
        this.send({ t: 'session.join', resume: this.opts.hasLivePeer?.() ?? false });
        break;
      case 'rtc.description':
      case 'rtc.candidate':
        this.opts.onRtc?.(msg);
        break;
      case 'session.ended':
        this.stopped = msg.reason !== 'TIMEOUT';
        this.setPhase({ kind: 'ended', reason: msg.reason });
        break;
      case 'error':
        this.onError(msg.code, msg.retryAfterMs);
        break;
    }
  }

  private onError(code: ErrorCode, retryAfterMs: number | undefined): void {
    switch (code) {
      case 'PIN_INVALID':
        this.setPhase({ kind: 'needPairing', reason: { code } });
        return;
      case 'PIN_LOCKED':
        this.stopped = true;
        this.setPhase({ kind: 'needPairing', reason: { code, retryAfterMs: retryAfterMs ?? 0 } });
        return;
      case 'TOKEN_INVALID':
      case 'REJECTED':
      case 'APPROVAL_BUSY':
        // Si ya estaba emparejado (QR viejo), se sigue con sus credenciales.
        this.stopped = !this.creds;
        if (!this.creds) this.setPhase({ kind: 'needPairing', reason: { code } });
        return;
      case 'AUTH_FAILED':
        clearCredentials(this.opts.storage);
        this.creds = null;
        this.stopped = true;
        this.setPhase({ kind: 'needPairing', reason: { code: 'FORGOTTEN' } });
        return;
      case 'BUSY':
        this.stopped = true;
        this.setPhase({ kind: 'busy' });
        return;
      case 'BAD_MESSAGE':
      case 'RATE_LIMITED':
      case 'INTERNAL':
        return;
    }
  }

  private onClosed(): void {
    if (this.stopped) {
      // Un PIN/QR rechazado deja el socket cerrado; para reintentar con PIN se reabre al enviar.
      return;
    }
    const delay = RETRY_STEPS_MS[Math.min(this.attempt, RETRY_STEPS_MS.length - 1)] ?? 8_000;
    this.attempt += 1;
    this.setPhase({ kind: 'offline', retryInMs: delay });
    this.retryTimer = setTimeout(() => this.connect(), delay);
  }

  private clearRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  private setPhase(phase: Phase): void {
    this.phase = phase;
    this.opts.onPhase(phase);
  }
}
