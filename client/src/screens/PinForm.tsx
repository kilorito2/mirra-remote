import { useId, useState, type SubmitEvent } from 'react';
import { APP_NAME } from '@shared/brand';
import { MirraMark } from '../MirraMark';
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
    <form onSubmit={submit} className="w-full max-w-sm space-y-7" noValidate>
      <div className="space-y-[18px]">
        <MirraMark />
        <div>
          <h1 className="text-[28px] leading-tight font-semibold tracking-tight text-balance">Conectá con tu PC</h1>
          <p className="mt-2 text-[15px] text-liquen">Escaneá el código de {APP_NAME} con la cámara, o escribí el PIN que aparece en la PC.</p>
        </div>
      </div>

      {reason && (
        <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-pico/30 bg-pico/10 px-3.5 py-3 text-sm text-[#c3cbff]">
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="mt-px size-[18px] shrink-0">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 8v5M12 16h.01" />
          </svg>
          <span>
            {REASON_TEXT[reason.code]}
            {lockedMinutes > 0 && ` Esperá ${lockedMinutes} min y volvé a probar.`}
          </span>
        </p>
      )}

      <div>
        <label htmlFor={pinId} className="block text-[13px] font-medium text-tenue">
          PIN
        </label>
        <div className="relative mt-2.5">
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
            className="flex items-center gap-2 rounded-xl peer-focus-visible:outline-2 peer-focus-visible:outline-offset-4 peer-focus-visible:outline-pico"
          >
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} className="contents">
                {i === 3 && <span className="h-0.5 w-2 shrink-0 bg-rama" />}
                <span
                  className={`flex h-[58px] flex-1 items-center justify-center rounded-xl border font-mono text-2xl font-semibold transition-colors ${
                    i < pin.length
                      ? 'border-rama bg-hoja text-pluma'
                      : i === pin.length
                        ? 'border-pico bg-hondo shadow-[0_0_0_3px_rgb(139_155_255/0.15)]'
                        : 'border-linea bg-hondo'
                  }`}
                >
                  {pin[i] ?? ''}
                </span>
              </span>
            ))}
          </div>
        </div>
        <p id={`${pinId}-hint`} className="mt-2.5 text-[13px] text-liquen">
          Seis números. Cambia cada dos minutos.
        </p>
      </div>

      <div>
        <label htmlFor={nameId} className="block text-[13px] font-medium text-tenue">
          Nombre de este celular
        </label>
        <input
          id={nameId}
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.currentTarget.value)}
          className="mt-2.5 min-h-[50px] w-full rounded-xl border border-rama bg-hoja px-3.5 transition-colors focus:border-pico"
        />
      </div>

      <button
        type="submit"
        disabled={pin.length !== 6 || !name.trim() || lockedMinutes > 0}
        className="min-h-[54px] w-full rounded-[14px] bg-pico text-[17px] font-semibold text-selva transition-[opacity,background-color] active:bg-pico-hondo disabled:opacity-40"
      >
        Conectar
      </button>
    </form>
  );
}
