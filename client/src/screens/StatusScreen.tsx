import type { ReactNode } from 'react';

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
    <div className="w-full max-w-sm" role="status" aria-busy={busy}>
      {busy && <Perch />}
      <h1 className="text-3xl leading-tight font-bold text-balance">{title}</h1>
      {children && <div className="mt-2 text-liquen">{children}</div>}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-8 min-h-12 w-full rounded-xl bg-pico text-lg font-semibold text-selva"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** Indicador de espera: el ojo del lorito parpadea (se queda quieto con reduced motion). */
function Perch() {
  return (
    <div aria-hidden="true" className="mb-8 flex size-14 items-center justify-center rounded-pill bg-rama">
      <span className="size-8 animate-[blink_2.4s_ease-in-out_infinite] rounded-pill bg-pico" />
    </div>
  );
}
