/**
 * Reconocedor de gestos (R18) como reductor puro: (estado, evento) → (estado, acciones).
 * No sabe de DOM ni de WebRTC; el tiempo entra por los eventos y por `tick`.
 */
export type Mode = 'trackpad' | 'direct';

export interface PointerInput {
  kind: 'down' | 'move' | 'up' | 'cancel';
  id: number;
  x: number;
  y: number;
  t: number;
}

export type GestureAction =
  /** Trackpad: delta crudo en px de la superficie (la aceleración se aplica afuera). */
  | { type: 'cursorDelta'; dx: number; dy: number; dt: number }
  /** Directo: el cursor va al punto tocado. */
  | { type: 'pointTo'; x: number; y: number }
  /** `x/y` presentes en modo directo; en trackpad el clic va donde está el cursor. */
  | { type: 'click'; button: 'left' | 'right'; count: 1 | 2; x?: number; y?: number }
  | { type: 'buttonDown'; x?: number; y?: number }
  | { type: 'buttonUp' }
  /** px de la superficie; dy > 0 = rueda hacia abajo (dedos hacia arriba). */
  | { type: 'scroll'; dx: number; dy: number }
  /** Zoom local del video: factor relativo y centro del pellizco, más el paneo del centro. */
  | { type: 'zoom'; factor: number; cx: number; cy: number; panX: number; panY: number }
  | { type: 'longPressArmed' };

export const GESTURE = {
  TAP_SLOP_PX: 10,
  TAP_MAX_MS: 300,
  DOUBLE_TAP_MS: 320,
  DOUBLE_TAP_PX: 30,
  LONG_PRESS_MS: 450,
  TWO_TAP_MAX_MS: 300,
  PINCH_SLOP_PX: 18,
  SCROLL_SLOP_PX: 8,
} as const;

interface Touch {
  id: number;
  x: number;
  y: number;
  startX: number;
  startY: number;
}

type Phase =
  | { kind: 'idle' }
  | { kind: 'one'; touch: Touch; startT: number; lastT: number; moved: boolean; dragging: boolean; longPressFired: boolean }
  | { kind: 'two'; a: Touch; b: Touch; startT: number; mode: 'undecided' | 'scroll' | 'pinch'; lastDist: number; lastCx: number; lastCy: number }
  /** Quedan dedos apoyados de un gesto terminado: se ignoran hasta levantar todos. */
  | { kind: 'draining'; ids: number[] };

export interface GestureState {
  mode: Mode;
  phase: Phase;
  lastTap: { t: number; x: number; y: number } | null;
}

export function initialGestureState(mode: Mode = 'trackpad'): GestureState {
  return { mode, phase: { kind: 'idle' }, lastTap: null };
}

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function reduceGesture(state: GestureState, ev: PointerInput): { state: GestureState; actions: GestureAction[] } {
  const { phase } = state;
  const actions: GestureAction[] = [];
  const next = (p: Phase, extra: Partial<GestureState> = {}) => ({ state: { ...state, ...extra, phase: p }, actions });

  if (ev.kind === 'cancel') {
    if (phase.kind === 'one' && phase.dragging) actions.push({ type: 'buttonUp' });
    return next({ kind: 'idle' });
  }

  switch (phase.kind) {
    case 'idle': {
      if (ev.kind !== 'down') return next(phase);
      const touch = { id: ev.id, x: ev.x, y: ev.y, startX: ev.x, startY: ev.y };
      return next({ kind: 'one', touch, startT: ev.t, lastT: ev.t, moved: false, dragging: false, longPressFired: false });
    }

    case 'one': {
      if (ev.kind === 'down' && ev.id !== phase.touch.id) {
        // Segundo dedo: scroll, pellizco o tap de dos dedos. Si ya había un drag, se ignora.
        if (phase.dragging || phase.moved) return next(phase);
        const a = phase.touch;
        const b = { id: ev.id, x: ev.x, y: ev.y, startX: ev.x, startY: ev.y };
        return next({ kind: 'two', a, b, startT: phase.startT, mode: 'undecided', lastDist: dist(a, b), lastCx: (a.x + b.x) / 2, lastCy: (a.y + b.y) / 2 });
      }
      if (ev.id !== phase.touch.id) return next(phase);

      if (ev.kind === 'move') {
        const touch = { ...phase.touch, x: ev.x, y: ev.y };
        const moved = phase.moved || dist({ x: ev.x, y: ev.y }, { x: touch.startX, y: touch.startY }) > GESTURE.TAP_SLOP_PX;
        // Dentro del umbral de tap no se informa nada; al superarlo, el delta incluye ese recorrido.
        if (!moved) return next(phase);
        let dragging = phase.dragging;
        if (state.mode === 'direct' && !dragging) {
          // Directo: arrastrar es arrastrar con el botón apretado desde donde se tocó.
          actions.push({ type: 'buttonDown', x: touch.startX, y: touch.startY });
          dragging = true;
        }
        if (state.mode === 'trackpad') actions.push({ type: 'cursorDelta', dx: ev.x - phase.touch.x, dy: ev.y - phase.touch.y, dt: Math.max(1, ev.t - phase.lastT) });
        else actions.push({ type: 'pointTo', x: ev.x, y: ev.y });
        return next({ ...phase, touch, moved, dragging, lastT: ev.t });
      }

      if (ev.kind === 'up') {
        if (phase.dragging) {
          actions.push({ type: 'buttonUp' });
          return next({ kind: 'idle' });
        }
        // Directo: mantener sin mover ya emitió el clic derecho.
        if (phase.longPressFired) return next({ kind: 'idle' });
        if (!phase.moved && ev.t - phase.startT <= GESTURE.TAP_MAX_MS) {
          return tap(state, phase.touch, ev.t, actions);
        }
        return next({ kind: 'idle' });
      }
      return next(phase);
    }

    case 'two': {
      const isA = ev.id === phase.a.id;
      const isB = ev.id === phase.b.id;
      if (ev.kind === 'down') return next(phase); // tercer dedo: ignorado
      if (!isA && !isB) return next(phase);

      if (ev.kind === 'up') {
        const remaining = isA ? phase.b.id : phase.a.id;
        if (phase.mode === 'undecided' && ev.t - phase.startT <= GESTURE.TWO_TAP_MAX_MS) {
          actions.push({ type: 'click', button: 'right', count: 1, ...(state.mode === 'direct' ? midpoint(phase) : {}) });
        }
        return next({ kind: 'draining', ids: [remaining] });
      }

      // move
      const a = isA ? { ...phase.a, x: ev.x, y: ev.y } : phase.a;
      const b = isB ? { ...phase.b, x: ev.x, y: ev.y } : phase.b;
      const d = dist(a, b);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      let mode = phase.mode;
      if (mode === 'undecided') {
        const startDist = dist({ x: a.startX, y: a.startY }, { x: b.startX, y: b.startY });
        const startCx = (a.startX + b.startX) / 2;
        const startCy = (a.startY + b.startY) / 2;
        if (Math.abs(d - startDist) > GESTURE.PINCH_SLOP_PX) mode = 'pinch';
        else if (Math.hypot(cx - startCx, cy - startCy) > GESTURE.SCROLL_SLOP_PX) mode = 'scroll';
      }
      if (mode === 'scroll' && phase.mode !== 'undecided') {
        actions.push({ type: 'scroll', dx: -(cx - phase.lastCx), dy: -(cy - phase.lastCy) });
      } else if (mode === 'pinch' && phase.mode !== 'undecided' && phase.lastDist > 0) {
        actions.push({ type: 'zoom', factor: d / phase.lastDist, cx, cy, panX: cx - phase.lastCx, panY: cy - phase.lastCy });
      }
      return next({ ...phase, a, b, mode, lastDist: d, lastCx: cx, lastCy: cy });
    }

    case 'draining': {
      if (ev.kind === 'up') {
        const ids = phase.ids.filter((id) => id !== ev.id);
        return next(ids.length ? { kind: 'draining', ids } : { kind: 'idle' });
      }
      if (ev.kind === 'down') return next({ kind: 'draining', ids: [...phase.ids, ev.id] });
      return next(phase);
    }
  }
}

function midpoint(p: { a: Touch; b: Touch }) {
  return { x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 };
}

function tap(state: GestureState, touch: Touch, t: number, actions: GestureAction[]) {
  const last = state.lastTap;
  const isDouble = !!last && t - last.t <= GESTURE.DOUBLE_TAP_MS && dist(last, { x: touch.startX, y: touch.startY }) <= GESTURE.DOUBLE_TAP_PX;
  // El segundo toque cae donde el primero: Windows necesita los dos clics casi en el mismo píxel.
  const at = isDouble ? { x: last.x, y: last.y } : { x: touch.startX, y: touch.startY };
  actions.push({ type: 'click', button: 'left', count: isDouble ? 2 : 1, ...(state.mode === 'direct' ? at : {}) });
  return {
    state: { ...state, phase: { kind: 'idle' as const }, lastTap: isDouble ? null : { t, x: at.x, y: at.y } },
    actions,
  };
}

/** Pasa el tiempo: dispara el long press (arrastre en trackpad, clic derecho en directo). */
export function tickGesture(state: GestureState, t: number): { state: GestureState; actions: GestureAction[] } {
  const p = state.phase;
  if (p.kind !== 'one' || p.moved || p.longPressFired || t - p.startT < GESTURE.LONG_PRESS_MS) return { state, actions: [] };
  if (state.mode === 'direct') {
    return {
      state: { ...state, phase: { ...p, longPressFired: true } },
      actions: [{ type: 'click', button: 'right', count: 1, x: p.touch.startX, y: p.touch.startY }],
    };
  }
  // Trackpad: mantener apretado arma el arrastre; el botón baja ya, así se ve que agarró.
  return {
    state: { ...state, phase: { ...p, longPressFired: true, dragging: true, moved: false } },
    actions: [{ type: 'longPressArmed' }, { type: 'buttonDown' }],
  };
}



/** Aceleración del trackpad: lento = preciso, rápido = cruza la pantalla. Ganancia entre 1 y 4. */
export function accelerate(dx: number, dy: number, dtMs: number, sensitivity = 1): { dx: number; dy: number } {
  const speed = Math.hypot(dx, dy) / Math.max(1, dtMs); // px/ms
  const gain = Math.min(4, Math.max(1, 1 + (speed - 0.25) * 1.6));
  return { dx: dx * gain * sensitivity, dy: dy * gain * sensitivity };
}
