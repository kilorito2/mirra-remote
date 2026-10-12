import type { SessionView } from '@shared/uiState';
import { formatSince } from '../format';
import { Button } from './controls';

export function SessionHeader({ session, now, onEnd }: { session: SessionView; now: number; onEnd: () => void }) {
  if (session.status === 'idle') {
    return (
      <header className="flex items-center gap-3 px-6 pt-6 pb-3">
        <span aria-hidden="true" className="size-2.5 rounded-pill bg-liquen" />
        <h1 className="text-xl font-semibold" data-testid="session-status">
          Esperando al celular
        </h1>
      </header>
    );
  }
  return (
    <header className="bg-alerta px-6 pt-6 pb-5 text-selva" role="status">
      <h1 className="text-xl leading-tight font-bold" data-testid="session-status">
        {session.deviceName} está controlando esta PC
      </h1>
      <p className="mt-1">
        Desde {session.ip}, conectado {formatSince(session.since, now)}. Ctrl+Alt+Shift+K corta al instante.
      </p>
      <div className="mt-4">
        <button
          type="button"
          onClick={onEnd}
          className="min-h-11 rounded-lg bg-selva px-5 font-semibold text-pluma hover:bg-hoja"
        >
          Cortar sesión
        </button>
      </div>
    </header>
  );
}

export function FirstRunNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside className="mx-6 mb-4 rounded-xl border border-pico/60 p-4" aria-label="Antes de empezar">
      <h2 className="font-semibold">Windows va a pedir permiso de red</h2>
      <p className="mt-1 text-sm text-liquen">
        Marcá solo <strong className="text-pluma">Redes privadas</strong>. Así el celular te encuentra en casa y nadie te ve en una
        Wi-Fi pública.
      </p>
      <div className="mt-2">
        <Button onClick={onDismiss}>Entendido</Button>
      </div>
    </aside>
  );
}
