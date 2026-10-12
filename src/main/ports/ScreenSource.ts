import type { DisplayInfo } from '@shared/protocol';

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Pantalla con su rectángulo en píxeles físicos (lo que usa el injector) además de la info pública. */
export interface ScreenDisplay extends DisplayInfo {
  physical: Rect;
}

/** Puerto de pantallas (ADR-0005). El adapter de Electron usa `screen`; un servicio nativo futuro podría ser otro. */
export interface ScreenSource {
  listDisplays(): ScreenDisplay[];
  primaryId(): string;
  onDisplaysChanged(cb: () => void): () => void;
}
