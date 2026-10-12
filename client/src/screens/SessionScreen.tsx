import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Video a pantalla completa (R22: `playsinline autoplay muted`). La superficie no deja que el navegador
 * haga zoom, scroll ni pull-to-refresh; los gestos llegan en la Fase 3.
 */
export function SessionScreen({
  stream,
  reconnecting,
  children,
}: {
  stream: MediaStream | null;
  reconnecting: boolean;
  children?: ReactNode;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => undefined);
  }, [stream]);

  return (
    <div className="fixed inset-0 touch-none overscroll-none bg-black select-none">
      <video
        ref={videoRef}
        data-testid="remote-video"
        className="h-full w-full object-contain"
        playsInline
        autoPlay
        muted
        disablePictureInPicture
      />
      {!stream && (
        <p role="status" className="absolute inset-0 flex items-center justify-center text-liquen">
          Esperando la imagen de la PC…
        </p>
      )}
      {reconnecting && (
        <p role="status" className="absolute top-3 left-1/2 -translate-x-1/2 rounded-pill bg-selva/90 px-4 py-2 text-sm">
          Reconectando…
        </p>
      )}
      {children}
    </div>
  );
}
