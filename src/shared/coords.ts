/** Mapeo de coordenadas (R17). Puro: main le pasa el rectángulo físico del display elegido. */
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

/**
 * Normalizado [0,1] relativo al frame de video → píxel físico dentro del display.
 * El frame es el display completo, así que 1.0 es el último píxel (no uno afuera).
 */
export function normalizedToPhysical(p: Point, rect: Rect): Point {
  return {
    x: rect.x + Math.round(clamp01(p.x) * (rect.width - 1)),
    y: rect.y + Math.round(clamp01(p.y) * (rect.height - 1)),
  };
}

/** Píxel físico → normalizado en ese display; `inside` es false si el cursor está en otro monitor. */
export function physicalToNormalized(p: Point, rect: Rect): Point & { inside: boolean } {
  const inside = p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height;
  const w = Math.max(1, rect.width - 1);
  const h = Math.max(1, rect.height - 1);
  return { x: clamp01((p.x - rect.x) / w), y: clamp01((p.y - rect.y) / h), inside };
}

/** Rectángulo físico a partir de los bounds en DIP y el escalado (lo que hace Windows para un monitor aislado). */
export function dipRectToPhysical(bounds: Rect, scaleFactor: number, physicalOrigin: Point): Rect {
  return {
    x: physicalOrigin.x,
    y: physicalOrigin.y,
    width: Math.round(bounds.width * scaleFactor),
    height: Math.round(bounds.height * scaleFactor),
  };
}
