import type { QualityPreset } from './constants';
import type { Point, Rect } from './coords';
import type { KeyName, MouseButton } from './protocol';
import type { UiState } from './uiState';

export type InjectedAction =
  | { type: 'move'; x: number; y: number }
  | { type: 'button'; button: MouseButton; action: 'down' | 'up' }
  | { type: 'scroll'; dx: number; dy: number }
  | { type: 'key'; key: KeyName; action: 'down' | 'up' }
  | { type: 'text'; text: string };

/** Hooks que main expone en REMOTE_TEST_MODE (`globalThis.__krTest`) para los E2E. */
export interface KrTestHooks {
  state(): UiState;
  indicators(): { live: boolean; overlay: boolean };
  hotkey(): void;
  token(): string;
  pin(): string;
  revoke(deviceId: string): void;
  setPreset(preset: QualityPreset): void;
  /** Solo con FakeInjector: lo que se habría inyectado. */
  injected(): InjectedAction[];
  clearInjected(): void;
  /** Teclas y botones que siguen apretados según el InputController. */
  pressed(): { keys: string[]; buttons: string[] };
  /** Posición real (o falsa) del cursor en píxeles físicos. */
  cursor(): Promise<Point>;
  activeRect(): Rect;
  /** Ventana con textarea para la prueba de teclado (KR_TEST_TEXTAREA). */
  focusTestpad(): Promise<void>;
  /** Muestra la ventana de prueba (con animación) sin robar el foco: genera frames de captura. */
  startActivity(): Promise<void>;
  testpadText(): Promise<string>;
  /** Rectángulo del textarea del testpad, normalizado al display transmitido. */
  testpadTextareaRect(): Promise<Rect>;
  /** true solo si la ventana de prueba tiene el foco (antes de tipear con el injector real). */
  testpadFocused(): boolean;
}
