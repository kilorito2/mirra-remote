import type { QualityPreset } from './constants';
import type { UiState } from './uiState';

/** Hooks que main expone en REMOTE_TEST_MODE (`globalThis.__krTest`) para los E2E. */
export interface KrTestHooks {
  state(): UiState;
  indicators(): { live: boolean; overlay: boolean };
  hotkey(): void;
  token(): string;
  pin(): string;
  revoke(deviceId: string): void;
  setPreset(preset: QualityPreset): void;
}
