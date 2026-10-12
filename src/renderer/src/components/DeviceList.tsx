import type { PublicDeviceInfo, SessionView } from '@shared/uiState';
import { formatSince } from '../format';
import { Icon } from './controls';

export function DeviceList({
  devices,
  session,
  now,
  onRevoke,
}: {
  devices: PublicDeviceInfo[];
  session: SessionView;
  now: number;
  onRevoke: (id: string) => void;
}) {
  if (devices.length === 0) {
    return <p className="px-4 py-3.5 text-[13px] text-liquen">Todavía no emparejaste ningún celular. Escaneá el código de arriba para empezar.</p>;
  }
  return (
    <ul className="divide-y divide-linea" aria-label="Dispositivos emparejados">
      {devices.map((d) => {
        const active = session.status === 'active' && session.deviceId === d.id;
        return (
          <li key={d.id} className="flex min-h-14 items-center gap-3 py-2.5 pr-2 pl-4">
            <span aria-hidden="true" className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-tecla text-tenue">
              <Icon name="phone" className="size-[18px]" />
            </span>
            <div className="min-w-0 grow">
              <p className="truncate font-medium">{d.name}</p>
              {active ? (
                <p className="flex items-center gap-1.5 text-xs text-menta">
                  <span aria-hidden="true" className="size-1.5 rounded-pill bg-menta" />
                  Conectado ahora
                </p>
              ) : (
                <p className="text-xs text-liquen">Usado {formatSince(d.lastSeenAt, now)}</p>
              )}
            </div>
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-[10px] px-3 text-[13px] font-medium text-alerta transition-colors hover:bg-alerta/10"
              onClick={() => onRevoke(d.id)}
              aria-label={`Revocar ${d.name}`}
            >
              Revocar
            </button>
          </li>
        );
      })}
    </ul>
  );
}
