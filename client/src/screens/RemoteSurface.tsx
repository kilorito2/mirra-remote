import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import type { Mode, PointerInput } from '../input/gestures';
import type { InputSender } from '../input/InputSender';
import { SurfaceController } from '../input/SurfaceController';
import type { CursorPos } from '../useRemote';

interface Props {
  stream: MediaStream | null;
  mode: Mode;
  sender: InputSender;
  onCursor: (cb: (pos: CursorPos) => void) => () => void;
  /** Cualquier toque en la superficie (para esconder la barra). */
  onActivity?: () => void;
}

/**
 * Superficie táctil sobre el video (R18). El navegador no hace zoom, scroll ni pull-to-refresh
 * (`touch-action: none`, `overscroll-behavior: none`); el zoom es local, con CSS transform.
 */
export function RemoteSurface({ stream, mode, sender, onCursor, onActivity }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const dotRef = useRef<HTMLDivElement>(null);
  const [surface] = useState(() => new SurfaceController(sender));

  useEffect(() => {
    surface.setMode(mode);
  }, [surface, mode]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
  }, [stream]);

  useEffect(() => {
    const root = rootRef.current;
    const video = videoRef.current;
    if (!root) return;
    surface.attach({ layer: layerRef.current, video, dot: dotRef.current });
    const measure = () => {
      const r = root.getBoundingClientRect();
      surface.resize({ width: r.width, height: r.height });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    const repaint = () => surface.paint();
    video?.addEventListener('resize', repaint);
    // El long press necesita que el tiempo avance aunque el dedo no se mueva.
    const ticker = setInterval(() => surface.tick(performance.now()), 40);
    const offCursor = onCursor((pos) => {
      if (pos.visible) surface.syncCursor({ x: pos.x, y: pos.y });
    });
    return () => {
      ro.disconnect();
      video?.removeEventListener('resize', repaint);
      clearInterval(ticker);
      offCursor();
    };
  }, [surface, onCursor, mode]);

  const feed = (kind: PointerInput['kind'], e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    surface.pointer({ kind, id: e.pointerId, x: e.clientX - r.left, y: e.clientY - r.top, t: e.timeStamp });
  };

  return (
    <div
      ref={rootRef}
      data-testid="surface"
      className="fixed inset-0 touch-none overscroll-none bg-black select-none"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        onActivity?.();
        feed('down', e);
      }}
      onPointerMove={(e) => feed('move', e)}
      onPointerUp={(e) => feed('up', e)}
      onPointerCancel={(e) => feed('cancel', e)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div ref={layerRef} className="absolute inset-0 origin-top-left will-change-transform">
        <video
          ref={videoRef}
          data-testid="remote-video"
          className="pointer-events-none h-full w-full object-contain"
          playsInline
          autoPlay
          muted
          disablePictureInPicture
        />
      </div>
      {mode === 'trackpad' && (
        <div
          ref={dotRef}
          aria-hidden="true"
          className="pointer-events-none absolute top-0 left-0 size-5 rounded-pill border-2 border-pico/90 shadow-[0_0_0_2px_rgb(15_38_36/0.6)]"
        />
      )}
      {!stream && (
        <p role="status" className="absolute inset-0 flex items-center justify-center text-liquen">
          Esperando la imagen de la PC…
        </p>
      )}
    </div>
  );
}
