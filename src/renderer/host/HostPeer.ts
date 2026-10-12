import { CHANNELS, type QualityPreset } from '@shared/constants';
import type { HostCommand, KrHostApi, SignalToHost } from '@shared/hostIpc';
import { orderVideoCodecs, planEncoding } from '@shared/media';
import { ControlFromPhone, InputFastFromPhone, parseJson, type ControlFromPc } from '@shared/protocol';

type StartCommand = Extract<HostCommand, { t: 'session.start' }>;

interface Channels {
  inputFast: RTCDataChannel;
  control: RTCDataChannel;
  file: RTCDataChannel;
}

/** `degradationPreference` existe en Chrome aunque lib.dom ya no lo declare. */
type SendParameters = RTCRtpSendParameters & { degradationPreference?: RTCDegradationPreference };
type RTCDegradationPreference = 'maintain-resolution' | 'maintain-framerate' | 'balanced';

/**
 * Lado PC de la sesión: captura (getDisplayMedia → handler de main), oferta con H.264 primero,
 * DataChannels negociados y presets en vivo. La PC siempre es la ofertante (también en ICE restart).
 */
export class HostPeer {
  private pc: RTCPeerConnection | null = null;
  private stream: MediaStream | null = null;
  private videoSender: RTCRtpSender | null = null;
  private audioSender: RTCRtpSender | null = null;
  private channels: Channels | null = null;
  private pendingCandidates: (RTCIceCandidateInit | null)[] = [];
  private preset: QualityPreset = 'sharp';
  private audioOn = true;
  private generation = 0;

  constructor(private readonly api: KrHostApi) {}

  async handle(cmd: HostCommand): Promise<void> {
    switch (cmd.t) {
      case 'session.start':
        await this.start(cmd);
        break;
      case 'session.stop':
        this.stop();
        break;
      case 'quality.set':
        this.preset = cmd.preset;
        await this.applyPreset();
        break;
      case 'audio.set':
        this.audioOn = cmd.on;
        this.stream?.getAudioTracks().forEach((t) => (t.enabled = cmd.on));
        break;
      case 'display.set':
        await this.switchDisplay();
        break;
      case 'control.send':
        this.sendControl(cmd.msg);
        break;
    }
  }

  async onSignal(msg: SignalToHost): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    if (msg.t === 'rtc.description') {
      await pc.setRemoteDescription(msg.description);
      for (const c of this.pendingCandidates.splice(0)) await this.addCandidate(pc, c);
    } else if (msg.t === 'rtc.candidate') {
      if (pc.remoteDescription) await this.addCandidate(pc, msg.candidate);
      else this.pendingCandidates.push(msg.candidate);
    } else {
      await this.restartIce();
    }
  }

  sendControl(msg: ControlFromPc): void {
    const ch = this.channels?.control;
    if (ch?.readyState === 'open') ch.send(JSON.stringify(msg));
  }

  private async start(cmd: StartCommand): Promise<void> {
    this.preset = cmd.preset;
    this.audioOn = cmd.audio;
    const state = this.pc?.connectionState;
    if (cmd.resume && this.pc && state !== 'closed' && state !== 'failed') {
      await this.restartIce();
      return;
    }
    this.stop();
    const generation = ++this.generation;

    let stream: MediaStream;
    try {
      stream = await this.capture();
    } catch (err) {
      this.api.event({ t: 'error', code: 'CAPTURE_FAILED', detail: String(err).slice(0, 200) });
      return;
    }
    if (generation !== this.generation) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    this.stream = stream;

    const pc = new RTCPeerConnection({ iceServers: [], bundlePolicy: 'max-bundle', rtcpMuxPolicy: 'require' });
    this.pc = pc;
    const video = pc.addTransceiver(stream.getVideoTracks()[0] ?? 'video', { direction: 'sendonly', streams: [stream] });
    const caps = RTCRtpSender.getCapabilities('video');
    if (caps) video.setCodecPreferences(orderVideoCodecs(caps.codecs));
    this.videoSender = video.sender;
    // Siempre hay m-line de audio: activar/desactivar el audio después no requiere renegociar.
    const audio = pc.addTransceiver(stream.getAudioTracks()[0] ?? 'audio', { direction: 'sendonly', streams: [stream] });
    this.audioSender = audio.sender;
    stream.getAudioTracks().forEach((t) => (t.enabled = this.audioOn));

    this.channels = this.openChannels(pc);
    pc.onicecandidate = (e) => {
      const c = e.candidate;
      this.api.sendSignal({
        t: 'rtc.candidate',
        candidate: c ? { candidate: c.candidate, sdpMid: c.sdpMid, sdpMLineIndex: c.sdpMLineIndex, usernameFragment: c.usernameFragment } : null,
      });
    };
    pc.onconnectionstatechange = () => {
      this.api.event({ t: 'peer.state', state: pc.connectionState });
      if (pc.connectionState === 'connected') void this.reportCodec(pc);
    };

    await this.applyPreset();
    await this.negotiate(pc, false);
  }

  private async capture(): Promise<MediaStream> {
    // Main elige la pantalla y agrega el loopback de audio (setDisplayMediaRequestHandler).
    return navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: { ideal: 60, max: 60 } },
      audio: true,
    });
  }

  /** R13: otra pantalla sin renegociar (replaceTrack). */
  private async switchDisplay(): Promise<void> {
    if (!this.pc || !this.videoSender) return;
    const next = await this.capture();
    const [track] = next.getVideoTracks();
    if (!track) return;
    await this.videoSender.replaceTrack(track);
    const [audioTrack] = next.getAudioTracks();
    if (audioTrack && this.audioSender) {
      audioTrack.enabled = this.audioOn;
      await this.audioSender.replaceTrack(audioTrack);
    }
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = next;
    await this.applyPreset();
  }

  private openChannels(pc: RTCPeerConnection): Channels {
    const make = (label: 'input-fast' | 'control' | 'file', id: number, init: RTCDataChannelInit) => {
      const ch = pc.createDataChannel(label, { ...init, negotiated: true, id });
      ch.onopen = () => this.api.event({ t: 'channel', label, open: true });
      ch.onclose = () => this.api.event({ t: 'channel', label, open: false });
      return ch;
    };
    const inputFast = make(CHANNELS.inputFast.label, CHANNELS.inputFast.id, { ordered: false, maxRetransmits: 0 });
    const control = make(CHANNELS.control.label, CHANNELS.control.id, { ordered: true });
    const file = make(CHANNELS.file.label, CHANNELS.file.id, { ordered: true });
    // Primera validación en el host; main valida otra vez antes de inyectar.
    inputFast.onmessage = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      const msg = parseJson(InputFastFromPhone, e.data);
      if (msg) this.api.input(msg);
    };
    control.onmessage = (e: MessageEvent) => {
      if (typeof e.data !== 'string') return;
      const msg = parseJson(ControlFromPhone, e.data);
      if (msg) this.api.input(msg);
    };
    return { inputFast, control, file };
  }

  private async applyPreset(): Promise<void> {
    const sender = this.videoSender;
    const track = sender?.track;
    if (!sender || !track) return;
    const plan = planEncoding(this.preset, track.getSettings().height ?? 1080);
    track.contentHint = plan.contentHint;
    const params = sender.getParameters() as SendParameters;
    const [encoding] = params.encodings;
    if (!encoding) return;
    encoding.maxBitrate = plan.maxBitrate;
    encoding.maxFramerate = plan.maxFramerate;
    encoding.scaleResolutionDownBy = plan.scaleResolutionDownBy;
    params.degradationPreference = plan.degradationPreference;
    try {
      await sender.setParameters(params);
    } catch (err) {
      this.api.event({ t: 'error', code: 'NEGOTIATION_FAILED', detail: `setParameters: ${String(err)}`.slice(0, 200) });
    }
  }

  private async restartIce(): Promise<void> {
    const pc = this.pc;
    if (!pc) return;
    pc.restartIce();
    await this.negotiate(pc, true);
  }

  private async negotiate(pc: RTCPeerConnection, iceRestart: boolean): Promise<void> {
    try {
      const offer = await pc.createOffer({ iceRestart });
      await pc.setLocalDescription(offer);
      if (offer.sdp) this.api.sendSignal({ t: 'rtc.description', description: { type: 'offer', sdp: offer.sdp } });
    } catch (err) {
      this.api.event({ t: 'error', code: 'NEGOTIATION_FAILED', detail: String(err).slice(0, 200) });
    }
  }

  private async addCandidate(pc: RTCPeerConnection, candidate: RTCIceCandidateInit | null): Promise<void> {
    try {
      await pc.addIceCandidate(candidate ?? undefined);
    } catch {
      // Candidatos de una generación ICE anterior: se descartan.
    }
  }

  private async reportCodec(pc: RTCPeerConnection): Promise<void> {
    const stats = await pc.getStats();
    let codecId: string | undefined;
    stats.forEach((s: RTCStats & { kind?: string; codecId?: string }) => {
      if (s.type === 'outbound-rtp' && s.kind === 'video') codecId = s.codecId;
    });
    const codec = codecId ? (stats.get(codecId) as (RTCStats & { mimeType?: string }) | undefined) : undefined;
    if (codec?.mimeType) this.api.event({ t: 'codec', mimeType: codec.mimeType });
  }

  stop(): void {
    this.generation++;
    this.pc?.close();
    this.pc = null;
    this.channels = null;
    this.videoSender = null;
    this.audioSender = null;
    this.pendingCandidates = [];
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.api.event({ t: 'peer.state', state: 'closed' });
  }
}
