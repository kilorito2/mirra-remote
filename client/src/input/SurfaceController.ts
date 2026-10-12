import { accelerate, initialGestureState, reduceGesture, tickGesture, type GestureAction, type Mode, type PointerInput } from './gestures';
import type { InputSender } from './InputSender';
import { NO_ZOOM, applyPinch, contentRect, followCursor, frameToSurface, surfaceToFrame, type Pt, type Size, type Zoom } from './surface';

export interface SurfaceElements {
  layer: HTMLElement | null;
  video: HTMLVideoElement | null;
  dot: HTMLElement | null;
}

/**
 * Estado de la superficie remota: gestos → acciones → mensajes, zoom local y cursor virtual.
 * Vive fuera de React: lo que cambia a 60 Hz se pinta con estilos directos.
 */
export class SurfaceController {
  private gesture = initialGestureState('trackpad');
  private zoom: Zoom = NO_ZOOM;
  private cursor: Pt = { x: 0.5, y: 0.5 };
  private view: Size = { width: 1, height: 1 };
  private els: SurfaceElements = { layer: null, video: null, dot: null };

  constructor(private readonly sender: InputSender) {}

  attach(els: SurfaceElements): void {
    this.els = els;
    this.paint();
  }

  setMode(mode: Mode): void {
    this.gesture = initialGestureState(mode);
  }

  get isTouching(): boolean {
    return this.gesture.phase.kind !== 'idle';
  }

  get zoomScale(): number {
    return this.zoom.scale;
  }

  resize(view: Size): void {
    this.view = view;
    this.paint();
  }

  pointer(ev: PointerInput): void {
    const result = reduceGesture(this.gesture, ev);
    this.gesture = result.state;
    this.apply(result.actions);
  }

  tick(t: number): void {
    if (this.gesture.phase.kind !== 'one') return;
    const result = tickGesture(this.gesture, t);
    this.gesture = result.state;
    if (result.actions.length) this.apply(result.actions);
  }

  /** Posición real del cursor de la PC: manda cuando no hay un dedo moviéndolo. */
  syncCursor(pos: Pt): void {
    if (this.isTouching) return;
    this.cursor = pos;
    this.follow();
    this.paint();
  }

  resetZoom(): void {
    this.zoom = NO_ZOOM;
    this.paint();
  }

  paint(): void {
    const { layer, dot } = this.els;
    const z = this.zoom;
    if (layer) layer.style.transform = `translate(${z.tx}px, ${z.ty}px) scale(${z.scale})`;
    if (dot) {
      const p = frameToSurface(this.cursor, this.view, this.videoSize(), z);
      dot.style.transform = `translate(${p.x - 10}px, ${p.y - 10}px)`;
    }
  }

  private videoSize(): Size {
    const v = this.els.video;
    return { width: v?.videoWidth ?? 0, height: v?.videoHeight ?? 0 };
  }

  private toFrame(x: number, y: number): Pt {
    return surfaceToFrame({ x, y }, this.view, this.videoSize(), this.zoom);
  }

  private follow(): void {
    this.zoom = followCursor(this.zoom, frameToSurface(this.cursor, this.view, this.videoSize(), this.zoom), this.view);
  }

  private apply(actions: GestureAction[]): void {
    for (const a of actions) {
      switch (a.type) {
        case 'cursorDelta': {
          const r = contentRect(this.view, this.videoSize());
          const acc = accelerate(a.dx, a.dy, a.dt);
          // Con zoom, el mismo recorrido del dedo mueve menos: más precisión donde se está mirando.
          const scale = this.zoom.scale;
          this.cursor = {
            x: Math.min(1, Math.max(0, this.cursor.x + acc.dx / (r.width * scale))),
            y: Math.min(1, Math.max(0, this.cursor.y + acc.dy / (r.height * scale))),
          };
          this.sender.move(this.cursor);
          this.follow();
          break;
        }
        case 'pointTo':
          this.cursor = this.toFrame(a.x, a.y);
          this.sender.move(this.cursor);
          break;
        case 'click':
          if (a.x !== undefined && a.y !== undefined) this.cursor = this.toFrame(a.x, a.y);
          this.sender.click(a.button, this.cursor);
          break;
        case 'buttonDown':
          if (a.x !== undefined && a.y !== undefined) this.cursor = this.toFrame(a.x, a.y);
          this.sender.button('left', 'down', this.cursor);
          break;
        case 'buttonUp':
          this.sender.button('left', 'up', this.cursor);
          break;
        case 'scroll':
          this.sender.scroll(a.dx, a.dy);
          break;
        case 'zoom':
          this.zoom = applyPinch(this.zoom, a.factor, { x: a.cx, y: a.cy }, { x: a.panX, y: a.panY }, this.view);
          break;
        case 'longPressArmed':
          // iOS Safari no tiene vibrate aunque lib.dom lo declare.
          if ('vibrate' in navigator) navigator.vibrate(12);
          break;
      }
    }
    this.paint();
  }
}
