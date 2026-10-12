import { desktopCapturer, session, webContents, type WebContents } from 'electron';

export interface CaptureTarget {
  displayId: string;
}

/**
 * R10: `getDisplayMedia()` del renderer host recibe la pantalla elegida (sin selector del sistema)
 * y el audio del sistema por loopback. El audio se captura siempre: el ajuste "Audio de la PC" solo habilita o
 * silencia la pista (audio.set), así prenderlo con la sesión andando no exige volver a capturar.
 * Cualquier otro renderer recibe un rechazo.
 */
export function installCaptureHandler(isHost: (wc: WebContents | null) => boolean, target: () => CaptureTarget): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      const requester = request.frame ? webContents.fromFrame(request.frame) : null;
      if (!isHost(requester ?? null)) {
        callback({});
        return;
      }
      const { displayId } = target();
      desktopCapturer
        .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => {
          const source = sources.find((s) => s.display_id === displayId) ?? sources[0];
          if (!source) {
            callback({});
            return;
          }
          callback({ video: source, audio: 'loopback' });
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: false },
  );
}
