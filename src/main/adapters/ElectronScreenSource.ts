import { screen, type Display } from 'electron';
import type { Rect, ScreenDisplay, ScreenSource } from '../ports/ScreenSource';

/** Rectángulo físico: en Windows lo calcula el sistema (respeta DPI mixto); en otros SO, escala simple. */
function physicalRect(display: Display): Rect {
  if (process.platform === 'win32') return screen.dipToScreenRect(null, display.bounds);
  const { x, y, width, height } = display.bounds;
  const s = display.scaleFactor;
  return { x: Math.round(x * s), y: Math.round(y * s), width: Math.round(width * s), height: Math.round(height * s) };
}

export class ElectronScreenSource implements ScreenSource {
  listDisplays(): ScreenDisplay[] {
    const primary = screen.getPrimaryDisplay().id;
    return screen.getAllDisplays().map((d, i) => {
      const physical = physicalRect(d);
      return {
        id: String(d.id),
        label: d.label || `Pantalla ${i + 1}`,
        width: physical.width,
        height: physical.height,
        scaleFactor: d.scaleFactor,
        primary: d.id === primary,
        physical,
      };
    });
  }

  primaryId(): string {
    return String(screen.getPrimaryDisplay().id);
  }

  onDisplaysChanged(cb: () => void): () => void {
    screen.on('display-added', cb);
    screen.on('display-removed', cb);
    screen.on('display-metrics-changed', cb);
    return () => {
      screen.off('display-added', cb);
      screen.off('display-removed', cb);
      screen.off('display-metrics-changed', cb);
    };
  }
}

export function electronDisplay(id: string): Display | undefined {
  return screen.getAllDisplays().find((d) => String(d.id) === id);
}
