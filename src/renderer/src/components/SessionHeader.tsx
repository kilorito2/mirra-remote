import { APP_NAME } from '@shared/brand';
import type { SessionView } from '@shared/uiState';
import { formatSince } from '../format';
import { Button, Icon } from './controls';
import { MirraMark } from './MirraMark';

export function SessionHeader({ session, now, onEnd }: { session: SessionView; now: number; onEnd: () => void }) {
  const active = session.status === 'active';
  return (
    <>
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <MirraMark />
          <span className="text-[15px] font-semibold tracking-tight">{APP_NAME}</span>
        </div>
        {active ? (
          <span className="flex items-center gap-2 rounded-pill border border-alerta/35 bg-alerta/12 px-3 py-1.5 text-[13px] font-medium text-alerta">
            <span aria-hidden="true" className="size-[7px] rounded-pill bg-alerta shadow-[0_0_0_4px_rgb(255_93_108/0.18)]" />
            En vivo
          </span>
        ) : (
          <span className="flex items-center gap-2 rounded-pill border border-linea bg-hoja px-3 py-1.5 text-liquen">
            <span aria-hidden="true" className="size-[7px] rounded-pill bg-liquen/70" />
            <h1 className="text-[13px] font-normal" data-testid="session-status">
              Esperando al celular
            </h1>
          </span>
        )}
      </header>
      {active && (
        <section role="status" className="space-y-4 rounded-[18px] border border-alerta/35 bg-[#1a1118] p-5">
          <div className="flex items-center gap-3.5">
            <span aria-hidden="true" className="flex size-11 shrink-0 items-center justify-center rounded-[13px] bg-alerta/14 text-alerta">
              <Icon name="phone" className="size-[22px]" />
            </span>
            <div className="min-w-0">
              <h1 className="text-lg leading-tight font-semibold tracking-tight" data-testid="session-status">
                {session.deviceName} está controlando esta PC
              </h1>
              <p className="mt-0.5 text-[13px] text-[#c9a9b4]">
                Desde <span className="font-mono">{session.ip}</span>, conectado {formatSince(session.since, now)}.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-[#c9a9b4]">
              Corte rápido:{' '}
              <kbd className="rounded-md border border-alerta/30 px-1.5 py-0.5 font-mono text-[11px] text-pluma">Ctrl+Alt+Shift+K</kbd>
            </span>
            <Button variant="danger" onClick={onEnd}>
              Cortar sesión
            </Button>
          </div>
        </section>
      )}
    </>
  );
}

export function FirstRunNotice({ onDismiss }: { onDismiss: () => void }) {
  return (
    <aside className="space-y-2 rounded-2xl border border-pico/30 bg-pico/8 p-4" aria-label="Antes de empezar">
      <h2 className="font-semibold">Windows va a pedir permiso de red</h2>
      <p className="text-[13px] text-tenue">
        Marcá solo <strong className="text-pluma">Redes privadas</strong>. Así el celular te encuentra en casa y nadie te ve en una
        Wi-Fi pública.
      </p>
      <Button size="sm" onClick={onDismiss}>
        Entendido
      </Button>
    </aside>
  );
}
