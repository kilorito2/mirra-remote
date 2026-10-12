import type { PublicDeviceInfo, SessionView } from '@shared/uiState';
import { formatSince } from '../format';

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
    return <p className="text-liquen">Todavía no emparejaste ningún celular. Escaneá el código de arriba para empezar.</p>;
  }
  return (
    <ul className="divide-y divide-rama/70" aria-label="Dispositivos emparejados">
      {devices.map((d) => {
        const active = session.status === 'active' && session.deviceId === d.id;
        return (
          <li key={d.id} className="flex min-h-14 items-center justify-between gap-3 py-2">
            <div className="min-w-0">
              <p className="truncate font-medium">{d.name}</p>
              <p className="text-sm text-liquen">{active ? 'Conectado ahora' : `Usado ${formatSince(d.lastSeenAt, now)}`}</p>
            </div>
            <button
              type="button"
              className="min-h-11 shrink-0 rounded-lg px-3 text-sm font-semibold text-alerta hover:bg-hoja"
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
