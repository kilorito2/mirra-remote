import type { UiState } from '@shared/uiState';
import { formatCountdown, formatPin, KIND_LABEL } from '../format';
import { Button } from './controls';

interface Props {
  server: UiState['server'];
  pairing: UiState['pairing'];
  now: number;
  onSelectIp: (ip: string) => void;
  onRegenerate: () => void;
}

export function PairingPanel({ server, pairing, now, onSelectIp, onRegenerate }: Props) {
  if (server.error) {
    return (
      <div role="alert" className="px-6 py-8">
        <h2 className="text-lg font-semibold">El servidor no arrancó</h2>
        <p className="mt-1 text-liquen">{server.error} Cerrá la otra aplicación o cambiá el puerto y volvé a abrir Kilorito Remote.</p>
      </div>
    );
  }
  if (server.ips.length === 0) {
    return (
      <div role="status" className="px-6 py-8">
        <h2 className="text-lg font-semibold">Sin red local</h2>
        <p className="mt-1 text-liquen">Conectá la PC a la misma Wi-Fi que el celular, o a Tailscale. La lista se actualiza sola.</p>
      </div>
    );
  }

  return (
    <div className="px-6 pt-2 pb-6">
      <div className="flex gap-5">
        <div className="shrink-0 rounded-2xl bg-pluma p-2">
          {pairing.qrDataUrl ? (
            <img src={pairing.qrDataUrl} alt="Código QR para conectar el celular" className="size-40 [image-rendering:pixelated]" />
          ) : (
            <div className="size-40" aria-hidden="true" />
          )}
        </div>
        <div className="flex min-w-0 flex-col justify-between py-1">
          <p className="text-pretty">Escaneá el código con la cámara del celular y aceptá la conexión acá.</p>
          <p className="text-sm text-liquen" aria-live="polite">
            Se renueva en {formatCountdown(pairing.tokenExpiresAt - now)}
          </p>
        </div>
      </div>

      <div className="mt-5 flex items-end justify-between gap-4">
        <div>
          <p className="text-sm text-liquen" id="pin-label">
            O entrá a la dirección y escribí el PIN
          </p>
          <p aria-labelledby="pin-label" className="text-pin leading-none font-bold tracking-wide text-pico tabular-nums" data-testid="pin">
            {formatPin(pairing.pin)}
          </p>
        </div>
        <Button onClick={onRegenerate}>Nuevo código</Button>
      </div>

      <label className="mt-5 block">
        <span className="sr-only">Red para conectar</span>
        <select
          className="min-h-11 w-full rounded-lg border border-rama bg-hoja px-3 tabular-nums"
          value={server.selectedIp ?? ''}
          onChange={(e) => onSelectIp(e.currentTarget.value)}
        >
          {server.ips.map((ip) => (
            <option key={ip.address} value={ip.address}>
              {KIND_LABEL[ip.kind]}: {ip.address.includes(':') ? `[${ip.address}]` : ip.address}:{server.port}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
