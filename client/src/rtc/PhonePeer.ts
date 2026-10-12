import { CHANNELS } from '@shared/constants';
import type { ClientSignal, ControlFromPhone, InputFastFromPhone } from '@shared/protocol';
import type { RtcFromPc } from '../net/signaling';

export interface PhonePeerEvents {
  onStream(stream: MediaStream): void;
  onState(state: RTCPeerConnectionState): void;
  onControlMessage?(data: string): void;
  onInputFastMessage?(data: string): void;
  onFileMessage?(data: string | ArrayBuffer): void;
  onChannelOpen?(label: 'input-fast' | 'control' | 'file'): void;
  onChannelClose?(label: 'input-fast' | 'control' | 'file'): void;
}

/** Cuánto se tolera `disconnected` antes de pedir ICE restart (cambio de WiFi, celular bloqueado). */
const DISCONNECTED_GRACE_MS = 2_000;

/**
 * Lado celular: contesta la oferta de la PC, recibe video/audio y crea los mismos DataChannels
 * negociados. Si la conexión se cae pide `rtc.restart`; la PC renegocia sin cortar la sesión.
 */
export class PhonePeer {
  private pc: RTCPeerConnection | null = null;
  private channels: Partial<Record<'input-fast' | 'control' | 'file', RTCDataChannel>> = {};
  private pending: (RTCIceCandidateInit | null)[] = [];
  private restartTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly send: (msg: ClientSignal) => void,
    private readonly events: PhonePeerEvents,
  ) {}

  get connection(): RTCPeerConnection | null {
    return this.pc;
  }

  /** Hay un RTCPeerConnection que vale la pena reanudar (para `session.join{resume}`). */
  isAlive(): boolean {
    const s = this.pc?.connectionState;
    return !!s && s !== 'closed' && s !== 'failed';
  }

  isConnected(): boolean {
    return this.pc?.connectionState === 'connected';
  }

  async onRtc(msg: RtcFromPc): Promise<void> {
    if (msg.t === 'rtc.description') {
      const pc = this.pc ?? this.create();
      await pc.setRemoteDescription(msg.description);
      for (const c of this.pending.splice(0)) await this.addCandidate(pc, c);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      if (answer.sdp) this.send({ t: 'rtc.description', description: { type: 'answer', sdp: answer.sdp } });
      return;
    }
    if (this.pc?.remoteDescription) await this.addCandidate(this.pc, msg.candidate);
    else this.pending.push(msg.candidate);
  }

  sendInputFast(msg: InputFastFromPhone): boolean {
    return this.sendOn('input-fast', JSON.stringify(msg));
  }

  sendControl(msg: ControlFromPhone): boolean {
    return this.sendOn('control', JSON.stringify(msg));
  }

  channel(label: 'input-fast' | 'control' | 'file'): RTCDataChannel | undefined {
    return this.channels[label];
  }

  /** El celular volvió a primer plano: si la conexión no está sana, se pide restart. */
  checkHealth(): void {
    const s = this.pc?.connectionState;
    if (s === 'disconnected' || s === 'failed') this.requestRestart();
  }

  close(): void {
    this.clearRestart();
    this.pc?.close();
    this.pc = null;
    this.channels = {};
    this.pending = [];
  }

  private create(): RTCPeerConnection {
    const pc = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle' });
    this.pc = pc;
    pc.ontrack = (e) => {
      const [stream] = e.streams;
      this.events.onStream(stream ?? new MediaStream([e.track]));
    };
    pc.onicecandidate = (e) => {
      const c = e.candidate;
      this.send({
        t: 'rtc.candidate',
        candidate: c ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment } : null,
      });
    };
    pc.onconnectionstatechange = () => {
      const state = pc.connectionState;
      this.events.onState(state);
      if (state === 'connected') this.clearRestart();
      else if (state === 'failed') this.requestRestart();
      else if (state === 'disconnected') {
        this.clearRestart();
        this.restartTimer = setTimeout(() => this.requestRestart(), DISCONNECTED_GRACE_MS);
      }
    };
    this.openChannels(pc);
    return pc;
  }

  private openChannels(pc: RTCPeerConnection): void {
    const make = (label: 'input-fast' | 'control' | 'file', id: number, init: RTCDataChannelInit) => {
      const ch = pc.createDataChannel(label, { ...init, negotiated: true, id });
      ch.binaryType = 'arraybuffer';
      ch.onopen = () => this.events.onChannelOpen?.(label);
      ch.onclose = () => this.events.onChannelClose?.(label);
      this.channels[label] = ch;
      return ch;
    };
    const fast = make(CHANNELS.inputFast.label, CHANNELS.inputFast.id, { ordered: false, maxRetransmits: 0 });
    const control = make(CHANNELS.control.label, CHANNELS.control.id, { ordered: true });
    const file = make(CHANNELS.file.label, CHANNELS.file.id, { ordered: true });
    fast.onmessage = (e: MessageEvent<unknown>) => {
      if (typeof e.data === 'string') this.events.onInputFastMessage?.(e.data);
    };
    control.onmessage = (e: MessageEvent<unknown>) => {
      if (typeof e.data === 'string') this.events.onControlMessage?.(e.data);
    };
    file.onmessage = (e: MessageEvent<unknown>) => {
      if (typeof e.data === 'string' || e.data instanceof ArrayBuffer) this.events.onFileMessage?.(e.data);
    };
  }

  private sendOn(label: 'input-fast' | 'control' | 'file', data: string): boolean {
    const ch = this.channels[label];
    if (ch?.readyState !== 'open') return false;
    ch.send(data);
    return true;
  }

  private requestRestart(): void {
    this.clearRestart();
    this.send({ t: 'rtc.restart' });
  }

  private clearRestart(): void {
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private async addCandidate(pc: RTCPeerConnection, c: RTCIceCandidateInit | null): Promise<void> {
    try {
      await pc.addIceCandidate(c ?? undefined);
    } catch {
      // Candidato de una generación ICE anterior.
    }
  }
}
