import { useId, useState, type SubmitEvent } from 'react';
import type { PairingReason } from '../net/signaling';

const REASON_TEXT: Record<PairingReason['code'], string> = {
  TOKEN_INVALID: 'El código QR ya se usó o venció. Escribí el PIN o escaneá el código nuevo.',
  PIN_INVALID: 'Ese PIN no coincide. Fijate el que muestra la PC ahora.',
  PIN_LOCKED: 'Demasiados intentos desde este celular.',
  REJECTED: 'La PC rechazó la conexión.',
  APPROVAL_BUSY: 'La PC ya está respondiendo otra solicitud. Probá en un momento.',
  FORGOTTEN: 'Esta PC ya no reconoce a este celular. Volvé a emparejarlo.',
};

export function PinForm({
  reason,
  defaultName,
  onSubmit,
}: {
  reason: PairingReason | null;
  defaultName: string;
  onSubmit: (pin: string, name: string) => void;
}) {
  const [pin, setPin] = useState('');
  const [name, setName] = useState(defaultName);
  const pinId = useId();
  const nameId = useId();
  const lockedMinutes = reason?.code === 'PIN_LOCKED' ? Math.max(1, Math.ceil(reason.retryAfterMs / 60_000)) : 0;

  const submit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pin.length === 6 && name.trim()) onSubmit(pin, name.trim());
  };

  return (
    <form onSubmit={submit} className="w-full max-w-sm space-y-6" noValidate>
      <div>
        <h1 className="text-3xl leading-tight font-bold text-balance">Conectá con tu PC</h1>
        <p className="mt-2 text-liquen">Escaneá el código de Kilorito Remote con la cámara, o escribí el PIN que aparece en la PC.</p>
      </div>

      {reason && (
        <p role="alert" className="rounded-xl bg-hoja px-4 py-3">
          {REASON_TEXT[reason.code]}
          {lockedMinutes > 0 && ` Esperá ${lockedMinutes} min y volvé a probar.`}
        </p>
      )}

      <div>
        <label htmlFor={pinId} className="block font-medium">
          PIN
        </label>
        <div className="relative mt-2">
          <input
            id={pinId}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9]*"
            maxLength={6}
            value={pin}
            onChange={(e) => setPin(e.currentTarget.value.replace(/\D/g, '').slice(0, 6))}
            className="peer absolute inset-0 h-full w-full opacity-0"
            aria-describedby={`${pinId}-hint`}
          />
          <div
            aria-hidden="true"
            className="grid grid-cols-6 gap-2 rounded-xl peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-pico"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <span
                key={i}
                className={`flex h-14 items-center justify-center rounded-lg text-2xl font-bold tabular-nums ${
                  i < pin.length ? 'bg-pluma text-selva' : 'bg-hoja text-liquen'
                } ${i === 2 ? 'mr-2' : ''}`}
              >
                {pin[i] ?? ''}
              </span>
            ))}
          </div>
        </div>
        <p id={`${pinId}-hint`} className="mt-2 text-sm text-liquen">
          Seis números. Cambia cada dos minutos.
        </p>
      </div>

      <div>
        <label htmlFor={nameId} className="block font-medium">
          Nombre de este celular
        </label>
        <input
          id={nameId}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.currentTarget.value)}
          className="mt-2 min-h-12 w-full rounded-lg border border-rama bg-hoja px-3"
        />
      </div>

      <button
        type="submit"
        disabled={pin.length !== 6 || !name.trim() || lockedMinutes > 0}
        className="min-h-12 w-full rounded-xl bg-pico text-lg font-semibold text-selva transition-opacity disabled:opacity-40"
      >
        Conectar
      </button>
    </form>
  );
}
