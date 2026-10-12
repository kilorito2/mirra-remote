import { BrowserWindow, ipcMain, type IpcMainEvent, type WebContents } from 'electron';
import type { QualityPreset } from '@shared/constants';
import { HostEvent, HostInput, HostSignal, type HostCommand, type PeerState, type SignalToHost } from '@shared/hostIpc';
import type { ControlFromPc, InputFastFromPc } from '@shared/protocol';
import type { ScreenSource } from './ports/ScreenSource';
import type { HostBridge } from './session/sessionManager';
import { hardenWebContents, isPageUrl, loadPage, securePreferences } from './windows';

export interface HostBridgeDeps {
  screens: ScreenSource;
  settings: () => { preset: QualityPreset; audio: boolean };
  /** Señales del host hacia el celular (vía WS). */
  toPeer: (msg: HostSignal) => void;
  onPeerState: (state: PeerState) => void;
  onInput: (msg: HostInput) => void;
  onChannel: (label: 'input-fast' | 'control' | 'file', open: boolean) => void;
  /** El renderer host murió o se cerró: hay que soltar el input y cortar. */
  onHostGone: () => void;
  /** La captura arrancó pero no hubo oferta a tiempo (p. ej. encoder por hardware colgado). */
  onStall: () => void;
}

/** Si en este tiempo no sale la primera oferta, se considera colgado el host. */
export const OFFER_TIMEOUT_MS = 10_000;

/**
 * Lado PC de WebRTC: una ventana oculta (`backgroundThrottling: false`) que captura la pantalla
 * y mantiene el RTCPeerConnection. Todo lo que llega de ella por IPC se valida.
 */
export class ElectronHostBridge implements HostBridge {
  private win: BrowserWindow | null = null;
  private ready: Promise<void> | null = null;
  private peerState: PeerState = 'closed';
  private displayId: string;

  constructor(private readonly deps: HostBridgeDeps) {
    this.displayId = deps.screens.primaryId();
    ipcMain.on('host:ready', (e) => {
      if (this.fromHost(e)) this.resolveReady?.();
    });
    ipcMain.on('host:signal', (e, raw: unknown) => {
      if (!this.fromHost(e)) return;
      const msg = HostSignal.safeParse(raw);
      if (!msg.success) return;
      if (msg.data.t === 'rtc.description') this.clearStall();
      deps.toPeer(msg.data);
    });
    ipcMain.on('host:event', (e, raw: unknown) => {
      if (!this.fromHost(e)) return;
      const evt = HostEvent.safeParse(raw);
      if (!evt.success) return;
      if (evt.data.t === 'peer.state') {
        this.peerState = evt.data.state;
        deps.onPeerState(evt.data.state);
      } else if (evt.data.t === 'channel') {
        deps.onChannel(evt.data.label, evt.data.open);
      } else if (evt.data.t === 'error') {
        console.error('[kr] host:', evt.data.code, evt.data.detail);
      }
    });
    ipcMain.on('host:input', (e, raw: unknown) => {
      if (!this.fromHost(e)) return;
      const msg = HostInput.safeParse(raw);
      if (msg.success) deps.onInput(msg.data);
    });
  }

  get activeDisplayId(): string {
    return this.displayId;
  }

  get audioEnabled(): boolean {
    return this.deps.settings().audio;
  }

  isHostContents(wc: WebContents | null): boolean {
    return !!wc && !!this.win && !this.win.isDestroyed() && wc.id === this.win.webContents.id;
  }

  start(opts: { resume: boolean }): void {
    void this.ensureWindow().then(() => {
      const { preset, audio } = this.deps.settings();
      this.send({ t: 'session.start', resume: opts.resume, displayId: this.displayId, preset, audio });
      this.clearStall();
      this.stallTimer = setTimeout(() => {
        this.stallTimer = null;
        this.deps.onStall();
      }, OFFER_TIMEOUT_MS);
    });
  }

  signal(msg: SignalToHost): void {
    // Sin ventana host no hay sesión a la que pertenezca la señal.
    if (!this.ready) return;
    void this.ready.then(() => this.win?.webContents.send('host:signal', msg));
  }

  stop(): void {
    this.clearStall();
    this.peerState = 'closed';
    this.send({ t: 'session.stop' });
  }

  isPeerConnected(): boolean {
    return this.peerState === 'connected' || this.peerState === 'disconnected';
  }

  setPreset(preset: QualityPreset): void {
    this.send({ t: 'quality.set', preset });
  }

  setAudio(on: boolean): void {
    this.send({ t: 'audio.set', on });
  }

  setDisplay(displayId: string): boolean {
    if (!this.deps.screens.listDisplays().some((d) => d.id === displayId)) return false;
    this.displayId = displayId;
    this.send({ t: 'display.set', displayId });
    return true;
  }

  sendControl(msg: ControlFromPc): void {
    this.send({ t: 'control.send', msg });
  }

  sendFast(msg: InputFastFromPc): void {
    this.send({ t: 'fast.send', msg });
  }

  private resolveReady: (() => void) | null = null;
  private stallTimer: NodeJS.Timeout | null = null;

  private clearStall(): void {
    if (this.stallTimer) clearTimeout(this.stallTimer);
    this.stallTimer = null;
  }

  private ensureWindow(): Promise<void> {
    if (this.win && !this.win.isDestroyed() && this.ready) return this.ready;
    const win = new BrowserWindow({
      show: false,
      width: 320,
      height: 240,
      skipTaskbar: true,
      webPreferences: { ...securePreferences('host'), backgroundThrottling: false },
    });
    hardenWebContents(win.webContents);
    win.webContents.on('render-process-gone', () => this.gone(win));
    // Los errores del host (captura, negociación) quedan en la consola de main para diagnosticar.
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error' || event.level === 'warning') console.error('[kr] host console:', event.message);
    });
    win.on('closed', () => this.gone(win));
    this.win = win;
    this.ready = new Promise<void>((resolve) => {
      this.resolveReady = resolve;
    });
    void loadPage(win, 'host');
    return this.ready;
  }

  private gone(win: BrowserWindow): void {
    if (this.win !== win) return;
    this.win = null;
    this.ready = null;
    this.peerState = 'closed';
    this.deps.onHostGone();
  }

  private send(cmd: HostCommand): void {
    if (this.win && !this.win.isDestroyed()) this.win.webContents.send('host:command', cmd);
  }

  private fromHost(e: IpcMainEvent): boolean {
    return this.isHostContents(e.sender) && isPageUrl(e.senderFrame?.url ?? '', 'host');
  }

  destroy(): void {
    const win = this.win;
    this.win = null;
    if (win && !win.isDestroyed()) win.destroy();
  }
}
