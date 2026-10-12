import type { Server } from 'node:https';
import { hostname } from 'node:os';
import { join } from 'node:path';
import QRCode from 'qrcode';
import type { QualityPreset } from '@shared/constants';
import type { SessionEndReason } from '@shared/protocol';
import type { LocalIp, TransferView, UiState } from '@shared/uiState';
import { ApprovalGate, type AskUser } from './auth/approval';
import { DeviceStore, type SecretCipher } from './auth/deviceStore';
import { PairingTokens } from './auth/pairingToken';
import { PinManager } from './auth/pin';
import { listLocalIps, pairingUrl } from './network';
import { ensureCertificates, type CertBundle } from './server/certs';
import { createHttpServer, indexStaticDir } from './server/httpServer';
import { Signaling } from './server/signaling';
import { SessionManager, type HostBridge, type SessionListener } from './session/sessionManager';
import { SettingsStore, type Settings } from './settings';
import type { TestMode } from './testMode';

export interface AppControllerDeps {
  userData: string;
  clientDir: string;
  testMode: TestMode;
  cipher: SecretCipher;
  ask: AskUser;
  host: HostBridge;
  /** Indicadores, notificación, cambios de preset/audio hacia el renderer host. */
  events: SessionListener & {
    onState(state: UiState): void;
    onSettings(settings: Settings): void;
  };
  setLoginItem(on: boolean): void;
}

const NETWORK_POLL_MS = 5_000;
const PAIRING_TICK_MS = 1_000;

export class AppController {
  readonly settings: SettingsStore;
  readonly devices: DeviceStore;
  readonly tokens = new PairingTokens();
  readonly pins: PinManager;
  readonly session: SessionManager;
  private readonly approval: ApprovalGate;
  private signaling: Signaling | null = null;
  private server: Server | null = null;
  private cert: CertBundle | null = null;
  private ips: LocalIp[] = [];
  private qr: { url: string; dataUrl: string } | null = null;
  private serverError: string | null = null;
  private timers: NodeJS.Timeout[] = [];
  private lastPairingKey = '';
  private readonly transfers = new Map<string, TransferView>();
  private lastTransferBroadcast = 0;

  constructor(private readonly deps: AppControllerDeps) {
    this.settings = new SettingsStore(join(deps.userData, 'settings.json'));
    this.devices = new DeviceStore(join(deps.userData, 'devices.json'), deps.cipher);
    this.pins = new PinManager();
    this.approval = new ApprovalGate(deps.testMode.autoApprove ? () => Promise.resolve(true) : deps.ask);
    this.session = new SessionManager(deps.host, {
      onStatus: (status) => {
        deps.events.onStatus(status);
        this.broadcast();
      },
      onEnded: (reason) => deps.events.onEnded(reason),
    });
  }

  get port(): number {
    return this.deps.testMode.port ?? this.settings.get().port;
  }

  async start(): Promise<void> {
    this.ips = listLocalIps(this.deps.testMode.enabled);
    await this.startServer();
    await this.refreshPairing(true);
    this.timers.push(
      setInterval(() => void this.refreshPairing(false), PAIRING_TICK_MS),
      setInterval(() => {
        this.refreshNetwork().catch((err: unknown) => {
          // Se sigue con el certificado y la lista de IPs anteriores; se reintenta en el próximo ciclo.
          console.error('[kr] no se pudo actualizar la red', err);
        });
      }, NETWORK_POLL_MS),
    );
  }

  async stop(): Promise<void> {
    this.timers.forEach(clearInterval);
    this.timers = [];
    this.session.end('USER');
    this.approval.abort();
    this.signaling?.close();
    const server = this.server;
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
        server.closeAllConnections();
      });
    }
  }

  state(): UiState {
    const s = this.settings.get();
    const token = this.tokens.current();
    const pin = this.pins.current();
    return {
      server: { port: this.port, ips: this.ips, selectedIp: this.selectedIp(), running: this.server?.listening ?? false, error: this.serverError },
      pairing: {
        url: this.qr?.url ?? null,
        qrDataUrl: this.qr?.dataUrl ?? null,
        tokenExpiresAt: token.expiresAt,
        pin: pin.pin,
        pinExpiresAt: pin.expiresAt,
      },
      session: this.session.status,
      devices: this.devices.list(),
      settings: { preset: s.preset, audio: s.audio, startWithWindows: s.startWithWindows, hardwareEncoding: s.hardwareEncoding },
      transfers: [...this.transfers.values()],
      firstRun: !s.firstRunDone,
      caFingerprint: this.cert?.caFingerprint ?? '',
    };
  }

  /** Progreso de transferencias para la UI: se guardan las últimas 8. */
  updateTransfer(t: TransferView): void {
    const prev = this.transfers.get(t.id);
    this.transfers.delete(t.id);
    this.transfers.set(t.id, t);
    while (this.transfers.size > 8) {
      const oldest = this.transfers.keys().next().value;
      if (oldest === undefined) break;
      this.transfers.delete(oldest);
    }
    // Un aviso cada 150 ms alcanza para la barra; los cambios de estado salen enseguida.
    const now = Date.now();
    if (prev?.state !== t.state || now - this.lastTransferBroadcast > 150) {
      this.lastTransferBroadcast = now;
      this.broadcast();
    }
  }

  broadcast(): void {
    this.deps.events.onState(this.state());
  }

  // ───────────── acciones de la UI ─────────────

  async selectIp(ip: string): Promise<void> {
    if (!this.ips.some((i) => i.address === ip)) return;
    this.settings.update({ selectedIp: ip });
    await this.refreshPairing(true);
  }

  setPreset(preset: QualityPreset): void {
    this.deps.events.onSettings(this.settings.update({ preset }));
    this.broadcast();
  }

  setAudio(audio: boolean): void {
    this.deps.events.onSettings(this.settings.update({ audio }));
    this.broadcast();
  }

  revokeDevice(id: string): void {
    if (!this.devices.revoke(id)) return;
    if (this.session.isActiveDevice(id)) this.session.end('REVOKED');
    this.signaling?.closeDevice(id, 'REVOKED');
    this.broadcast();
  }

  endSession(reason: SessionEndReason = 'USER'): void {
    this.approval.abort();
    this.session.end(reason);
  }

  setStartWithWindows(on: boolean): void {
    this.settings.update({ startWithWindows: on });
    this.deps.setLoginItem(on);
    this.broadcast();
  }

  dismissFirstRun(): void {
    this.settings.update({ firstRunDone: true });
    this.broadcast();
  }

  async regeneratePairing(): Promise<void> {
    this.tokens.rotate();
    this.pins.rotate();
    await this.refreshPairing(true);
  }

  // ───────────── internos ─────────────

  private selectedIp(): string | null {
    const wanted = this.settings.get().selectedIp;
    if (wanted && this.ips.some((i) => i.address === wanted)) return wanted;
    return this.ips[0]?.address ?? null;
  }

  private async startServer(): Promise<void> {
    this.cert = await ensureCertificates({
      dir: join(this.deps.userData, 'certs'),
      cipher: this.deps.cipher,
      ips: this.ips.map((i) => i.address),
    });
    const server = createHttpServer({
      cert: this.cert,
      files: indexStaticDir(this.deps.clientDir),
      allowLoopback: this.deps.testMode.enabled,
    });
    this.signaling = new Signaling({
      tokens: this.tokens,
      pins: this.pins,
      devices: this.devices,
      approval: this.approval,
      session: this.session,
      hostName: hostname(),
      allowLoopback: this.deps.testMode.enabled,
      onPaired: () => {
        void this.refreshPairing(true);
      },
    });
    this.signaling.attach(server);
    this.server = server;
    try {
      await listen(server, this.port);
      this.serverError = null;
    } catch (err) {
      this.serverError =
        (err as NodeJS.ErrnoException).code === 'EADDRINUSE'
          ? `El puerto ${this.port} está ocupado por otra aplicación.`
          : 'No se pudo iniciar el servidor.';
    }
  }

  /** Regenera el QR cuando cambian token, PIN o IP elegida (el token vence y rota solo). */
  private async refreshPairing(force: boolean): Promise<void> {
    const token = this.tokens.current();
    const pin = this.pins.current();
    const ip = this.selectedIp();
    const key = `${token.token}|${pin.pin}|${ip ?? ''}|${this.port}`;
    if (!force && key === this.lastPairingKey) return;
    this.lastPairingKey = key;
    if (ip) {
      const url = pairingUrl(ip, this.port, token.token);
      const dataUrl = await QRCode.toDataURL(url, {
        errorCorrectionLevel: 'M',
        margin: 1,
        width: 480,
        color: { dark: '#0F2624', light: '#EAF2EC' },
      });
      this.qr = { url, dataUrl };
    } else {
      this.qr = null;
    }
    this.broadcast();
  }

  private async refreshNetwork(): Promise<void> {
    const next = listLocalIps(this.deps.testMode.enabled);
    const changed = next.map((i) => i.address).join() !== this.ips.map((i) => i.address).join();
    if (!changed) return;
    // Si apareció una IP fuera del SAN, se regenera el certificado de servidor y se aplica sin reiniciar.
    const cert = await ensureCertificates({
      dir: join(this.deps.userData, 'certs'),
      cipher: this.deps.cipher,
      ips: next.map((i) => i.address),
    });
    if (cert.serverCertPem !== this.cert?.serverCertPem) {
      this.server?.setSecureContext({ cert: cert.serverCertPem, key: cert.serverKeyPem, minVersion: 'TLSv1.2' });
    }
    this.cert = cert;
    this.ips = next;
    await this.refreshPairing(true);
  }
}

function listen(server: Server, port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      // Sin IPv6 en el sistema: se cae a IPv4.
      if (err.code === 'EAFNOSUPPORT' || err.code === 'EADDRNOTAVAIL') {
        server.once('error', reject);
        server.listen(port, '0.0.0.0', () => resolve());
        return;
      }
      reject(err);
    };
    server.once('error', onError);
    // '::' con dual-stack escucha IPv4 e IPv6 a la vez.
    server.listen({ port, host: '::', ipv6Only: false }, () => {
      server.off('error', onError);
      resolve();
    });
  });
}
