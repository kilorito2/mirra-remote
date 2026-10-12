import { APP_NAME } from '@shared/brand';
import { TOKEN_TTL_MS } from '@shared/constants';
import type { UiState } from '@shared/uiState';
import { formatCountdown, formatPin, KIND_LABEL } from '../format';
import { Button, Icon } from './controls';

interface Props {
  server: UiState['server'];
  pairing: UiState['pairing'];
  now: number;
  onSelectIp: (ip: string) => void;
  onRegenerate: () => void;
}

const card = 'rounded-[18px] border border-linea bg-hoja p-5';

export function PairingPanel({ server, pairing, now, onSelectIp, onRegenerate }: Props) {
  if (server.error) {
    return (
      <div role="alert" className={card}>
        <h2 className="text-lg font-semibold">El servidor no arrancó</h2>
        <p className="mt-1 text-liquen">
          {server.error} Cerrá la otra aplicación o cambiá el puerto y volvé a abrir {APP_NAME}.
        </p>
      </div>
    );
  }
  if (server.ips.length === 0) {
    return (
      <div role="status" className={card}>
        <h2 className="text-lg font-semibold">Sin red local</h2>
        <p className="mt-1 text-liquen">Conectá la PC a la misma Wi-Fi que el celular, o a Tailscale. La lista se actualiza sola.</p>
      </div>
    );
  }

  const left = pairing.tokenExpiresAt - now;
  const progress = Math.min(100, Math.max(0, (left / TOKEN_TTL_MS) * 100));

  return (
    <section aria-label="Emparejar" className={`${card} space-y-[18px]`}>
      <div>
        <h2 className="text-[19px] font-semibold tracking-tight">Conectá un celular</h2>
        <p className="mt-1 text-liquen">Escaneá el código con la cámara del celular y aceptá la conexión acá.</p>
      </div>

      <div className="flex gap-[18px]">
        <div className="shrink-0 rounded-[14px] bg-pluma p-2.5">
          {pairing.qrDataUrl ? (
            <img src={pairing.qrDataUrl} alt="Código QR para conectar el celular" className="size-36 [image-rendering:pixelated]" />
          ) : (
            <div className="size-36" aria-hidden="true" />
          )}
        </div>
        <div className="flex min-w-0 grow flex-col justify-between">
          <div>
            <p className="text-xs text-liquen" id="pin-label">
              O entrá a la dirección y escribí el PIN
            </p>
            <p aria-labelledby="pin-label" className="mt-0.5 font-mono text-pin leading-tight font-semibold tracking-wide text-pico" data-testid="pin">
              {formatPin(pairing.pin)}
            </p>
          </div>
          <div className="space-y-1.5">
            <p className="flex justify-between text-xs text-liquen" aria-live="polite">
              <span>Se renueva en</span>
              <span className="font-mono">{formatCountdown(left)}</span>
            </p>
            <div aria-hidden="true" className="h-1 overflow-hidden rounded-pill bg-rama/70">
              <div className="h-full rounded-pill bg-pico transition-[width] duration-1000 ease-linear" style={{ width: `${progress}%` }} />
            </div>
          </div>
          <div>
            <Button size="sm" onClick={onRegenerate}>
              <Icon name="refresh" className="size-3.5" />
              Nuevo código
            </Button>
          </div>
        </div>
      </div>

      <label className="block space-y-1.5">
        <span className="block text-xs text-liquen">Red para conectar</span>
        <span className="relative block">
          <select
            className="min-h-11 w-full cursor-pointer appearance-none rounded-xl border border-linea bg-hondo pr-10 pl-3.5 font-mono text-[13px]"
            value={server.selectedIp ?? ''}
            onChange={(e) => onSelectIp(e.currentTarget.value)}
          >
            {server.ips.map((ip) => (
              <option key={ip.address} value={ip.address}>
                {KIND_LABEL[ip.kind]}: {ip.address.includes(':') ? `[${ip.address}]` : ip.address}:{server.port}
              </option>
            ))}
          </select>
          <Icon name="chevronDown" className="pointer-events-none absolute top-3.5 right-3.5 size-4 text-liquen" />
        </span>
      </label>
    </section>
  );
}
