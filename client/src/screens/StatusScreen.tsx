import type { ReactNode } from 'react';
import { MirraMark } from '../MirraMark';

export function StatusScreen({
  title,
  children,
  action,
  busy = false,
}: {
  title: string;
  children?: ReactNode;
  action?: { label: string; onClick: () => void };
  busy?: boolean;
}) {
  return (
    <div className="flex w-full max-w-sm flex-col items-center text-center" role="status" aria-busy={busy}>
      {busy ? <Waiting /> : <MirraMark className="mb-8 size-14" />}
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-balance">{title}</h1>
      {children && <div className="mt-2.5 text-[15px] text-pretty text-liquen">{children}</div>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-8 min-h-[54px] w-full rounded-[14px] bg-pico text-[17px] font-semibold text-selva transition-colors active:bg-pico-hondo"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Indicador de espera: el logo grande con su trazo animado y un pulso suave alrededor. */
function Waiting() {
  return (
    <div aria-hidden="true" className="relative mb-9 size-24">
      <span className="absolute inset-0 animate-[pulse-ring_2s_ease-out_infinite] rounded-pill bg-pico/25" />
      <MirraMark className="relative size-24" />
    </div>
  );
}
