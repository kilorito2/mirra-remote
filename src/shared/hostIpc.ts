/** Contrato IPC entre main y el renderer host (docs/PROTOCOL.md §4). */
import { z } from 'zod';
import { QUALITY_PRESET_NAMES, type QualityPreset } from './constants';
import { ControlFromPhone, InputFastFromPhone, RtcCandidate, RtcSdp, type ClientSignal, type ControlFromPc, type InputFastFromPc } from './protocol';

export type HostCommand =
  | { t: 'session.start'; resume: boolean; displayId: string; preset: QualityPreset; audio: boolean }
  | { t: 'session.stop' }
  | { t: 'display.set'; displayId: string }
  | { t: 'quality.set'; preset: QualityPreset }
  | { t: 'audio.set'; on: boolean }
  | { t: 'control.send'; msg: ControlFromPc }
  | { t: 'fast.send'; msg: InputFastFromPc };

/** Señales del celular que main reenvía al host. */
export type SignalToHost = Extract<ClientSignal, { t: 'rtc.description' | 'rtc.candidate' | 'rtc.restart' }>;

/** Lo que el host manda a main: se valida en main con estos schemas. */
export const HostSignal = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('rtc.description'), description: z.strictObject({ type: z.literal('offer'), sdp: RtcSdp }) }),
  z.strictObject({ t: z.literal('rtc.candidate'), candidate: RtcCandidate }),
]);
export type HostSignal = z.infer<typeof HostSignal>;

export const PeerState = z.enum(['new', 'connecting', 'connected', 'disconnected', 'failed', 'closed']);
export type PeerState = z.infer<typeof PeerState>;

export const HostEvent = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('peer.state'), state: PeerState }),
  z.strictObject({ t: z.literal('channel'), label: z.enum(['input-fast', 'control', 'file']), open: z.boolean() }),
  z.strictObject({ t: z.literal('codec'), mimeType: z.string().max(64) }),
  z.strictObject({ t: z.literal('error'), code: z.enum(['CAPTURE_FAILED', 'NEGOTIATION_FAILED']), detail: z.string().max(200) }),
]);
export type HostEvent = z.infer<typeof HostEvent>;

/** Input del celular reenviado por el host (main valida de nuevo: el IPC también es un borde). */
export const HostInput = z.union([InputFastFromPhone, ControlFromPhone]);
export type HostInput = z.infer<typeof HostInput>;

export const HostPreset = z.enum(QUALITY_PRESET_NAMES);

/** API que el preload del host expone como `window.krHost`. */
export interface KrHostApi {
  onCommand(cb: (cmd: HostCommand) => void): () => void;
  onSignal(cb: (msg: SignalToHost) => void): () => void;
  sendSignal(msg: HostSignal): void;
  event(evt: HostEvent): void;
  input(msg: HostInput): void;
  /** Avisa que el host cargó y escucha comandos. */
  ready(): void;
}
