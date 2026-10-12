import type { Point } from '@shared/coords';
import type { KeyName, MouseButton } from '@shared/protocol';

/**
 * Puerto de inyección de input (ADR-0005). Coordenadas en píxeles físicos del escritorio virtual.
 * El InputController es el único cliente y lleva el registro de lo apretado.
 */
export interface InputInjector {
  moveTo(p: Point): Promise<void>;
  button(button: MouseButton, action: 'down' | 'up'): Promise<void>;
  /** Unidades WHEEL_DELTA (120 = una muesca). dy > 0 = rueda hacia abajo; dx > 0 = hacia la derecha. */
  scroll(dx: number, dy: number): Promise<void>;
  key(key: KeyName, action: 'down' | 'up'): Promise<void>;
  /** Texto unicode; no deja teclas apretadas. */
  typeText(text: string): Promise<void>;
  cursorPosition(): Promise<Point>;
  /** Las pantallas cambiaron (resolución, monitores): refrescar métricas. */
  displaysChanged(): void;
}
