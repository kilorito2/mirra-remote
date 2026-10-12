import { desktopCapturer, session, webContents, type WebContents } from 'electron';

export interface CaptureTarget {
  displayId: string;
  audio: boolean;
}

/**
 * R10: `getDisplayMedia()` del renderer host recibe la pantalla elegida (sin selector del sistema)
 * y el audio del sistema por loopback. Cualquier otro renderer recibe un rechazo.
 */
export function installCaptureHandler(isHost: (wc: WebContents | null) => boolean, target: () => CaptureTarget): void {
  session.defaultSession.setDisplayMediaRequestHandler(
    (request, callback) => {
      const requester = request.frame ? webContents.fromFrame(request.frame) : null;
      if (!isHost(requester ?? null)) {
        callback({});
        return;
      }
      const { displayId, audio } = target();
      desktopCapturer
        .getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } })
        .then((sources) => {
          const source = sources.find((s) => s.display_id === displayId) ?? sources[0];
          if (!source) {
            callback({});
            return;
          }
          callback(audio ? { video: source, audio: 'loopback' } : { video: source });
        })
        .catch(() => callback({}));
    },
    { useSystemPicker: false },
  );
}
