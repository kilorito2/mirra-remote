/**
 * Geometría de la superficie de video (puro): dónde se dibuja el frame (object-fit: contain),
 * el zoom/paneo local (no cambia nada en la PC) y la conversión toque ⇄ frame normalizado.
 */
export interface Size {
  width: number;
  height: number;
}

export interface Pt {
  x: number;
  y: number;
}

/** Transformación CSS del contenedor del video: translate(tx, ty) scale(scale), origen 0 0. */
export interface Zoom {
  scale: number;
  tx: number;
  ty: number;
}

export const NO_ZOOM: Zoom = { scale: 1, tx: 0, ty: 0 };
export const MAX_ZOOM = 5;

/** Rectángulo (en px de la vista sin zoom) donde queda el frame con letterbox. */
export function contentRect(view: Size, video: Size): { x: number; y: number; width: number; height: number } {
  if (video.width <= 0 || video.height <= 0) return { x: 0, y: 0, width: view.width, height: view.height };
  const scale = Math.min(view.width / video.width, view.height / video.height);
  const width = video.width * scale;
  const height = video.height * scale;
  return { x: (view.width - width) / 2, y: (view.height - height) / 2, width, height };
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** Punto de la pantalla del celular → coordenada normalizada del frame (clampeada a [0,1]). */
export function surfaceToFrame(p: Pt, view: Size, video: Size, zoom: Zoom): Pt {
  const local = { x: (p.x - zoom.tx) / zoom.scale, y: (p.y - zoom.ty) / zoom.scale };
  const r = contentRect(view, video);
  return { x: clamp((local.x - r.x) / r.width, 0, 1), y: clamp((local.y - r.y) / r.height, 0, 1) };
}

/** Coordenada normalizada del frame → punto en la pantalla del celular (con zoom aplicado). */
export function frameToSurface(p: Pt, view: Size, video: Size, zoom: Zoom): Pt {
  const r = contentRect(view, video);
  return { x: (r.x + p.x * r.width) * zoom.scale + zoom.tx, y: (r.y + p.y * r.height) * zoom.scale + zoom.ty };
}

/** Mantiene el contenido cubriendo la vista: no se puede panear más allá de los bordes. */
export function clampZoom(z: Zoom, view: Size): Zoom {
  const scale = clamp(z.scale, 1, MAX_ZOOM);
  const minTx = view.width - view.width * scale;
  const minTy = view.height - view.height * scale;
  return { scale, tx: clamp(z.tx, minTx, 0), ty: clamp(z.ty, minTy, 0) };
}

/** Pellizco: escala alrededor del centro del gesto y panea con el movimiento del centro. */
export function applyPinch(z: Zoom, factor: number, center: Pt, pan: Pt, view: Size): Zoom {
  const scale = clamp(z.scale * factor, 1, MAX_ZOOM);
  const real = scale / z.scale;
  return clampZoom(
    { scale, tx: center.x - (center.x - z.tx) * real + pan.x, ty: center.y - (center.y - z.ty) * real + pan.y },
    view,
  );
}

/** Con zoom activo, la vista sigue al cursor cuando se acerca a menos de `margin` del borde. */
export function followCursor(z: Zoom, cursor: Pt, view: Size, margin = 0.2): Zoom {
  if (z.scale <= 1) return z;
  const mx = view.width * margin;
  const my = view.height * margin;
  let { tx, ty } = z;
  if (cursor.x < mx) tx += mx - cursor.x;
  else if (cursor.x > view.width - mx) tx -= cursor.x - (view.width - mx);
  if (cursor.y < my) ty += my - cursor.y;
  else if (cursor.y > view.height - my) ty -= cursor.y - (view.height - my);
  return clampZoom({ scale: z.scale, tx, ty }, view);
}
