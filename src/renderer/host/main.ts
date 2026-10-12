import type { KrHostApi } from '@shared/hostIpc';
import { HostPeer } from './HostPeer';

declare global {
  interface Window {
    krHost: KrHostApi;
  }
}

const api = window.krHost;
const peer = new HostPeer(api);

// Los comandos se procesan en orden: un start y un stop seguidos no se pisan.
let queue: Promise<void> = Promise.resolve();
api.onCommand((cmd) => {
  queue = queue.then(() => peer.handle(cmd)).catch((err: unknown) => {
    api.event({ t: 'error', code: 'NEGOTIATION_FAILED', detail: String(err).slice(0, 200) });
  });
});
api.onSignal((msg) => {
  queue = queue.then(() => peer.onSignal(msg)).catch(() => undefined);
});
api.ready();
