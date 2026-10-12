import { z } from 'zod';
import { QUALITY_PRESET_NAMES, type QualityPreset } from './constants';
import { DeviceId } from './protocol';

export type InterfaceKind = 'wifi' | 'ethernet' | 'tailscale' | 'other' | 'loopback';

export interface LocalIp {
  address: string;
  iface: string;
  kind: InterfaceKind;
}

export interface PublicDeviceInfo {
  id: string;
  name: string;
  createdAt: number;
  lastSeenAt: number;
}

export type SessionView =
  | { status: 'idle' }
  | { status: 'active'; deviceId: string; deviceName: string; ip: string; since: number };

export interface TransferView {
  id: string;
  name: string;
  size: number;
  done: number;
  direction: 'toPc' | 'toPhone';
  state: 'running' | 'done' | 'cancelled' | 'error';
}

export interface UiState {
  server: { port: number; ips: LocalIp[]; selectedIp: string | null; running: boolean; error: string | null };
  pairing: { url: string | null; qrDataUrl: string | null; tokenExpiresAt: number; pin: string; pinExpiresAt: number };
  session: SessionView;
  devices: PublicDeviceInfo[];
  settings: { preset: QualityPreset; audio: boolean; startWithWindows: boolean; hardwareEncoding: boolean };
  transfers: TransferView[];
  firstRun: boolean;
  caFingerprint: string;
}

/** Argumentos que llegan del renderer UI: se validan en main aunque el renderer sea nuestro. */
export const UiArgs = {
  selectIp: z.string().min(2).max(64),
  setPreset: z.enum(QUALITY_PRESET_NAMES),
  setAudio: z.boolean(),
  revokeDevice: DeviceId,
  setStartWithWindows: z.boolean(),
  setHardwareEncoding: z.boolean(),
  sendFiles: z.array(z.string().min(1).max(4096)).min(1).max(20),
  cancelTransfer: z.string().min(1).max(64),
} as const;

/** API que el preload de la UI expone como `window.kr`. */
export interface KrUiApi {
  getState(): Promise<UiState>;
  onState(cb: (state: UiState) => void): () => void;
  selectIp(ip: string): Promise<void>;
  setPreset(preset: QualityPreset): Promise<void>;
  setAudio(on: boolean): Promise<void>;
  revokeDevice(id: string): Promise<void>;
  endSession(): Promise<void>;
  setStartWithWindows(on: boolean): Promise<void>;
  /** Reinicia la app para aplicar el cambio. */
  setHardwareEncoding(on: boolean): Promise<void>;
  dismissFirstRun(): Promise<void>;
  regeneratePairing(): Promise<void>;
  pickAndSendFile(): Promise<void>;
  sendFiles(files: File[]): Promise<void>;
  cancelTransfer(id: string): Promise<void>;
}
