import type { ReactNode } from 'react';

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4 px-4 py-3">
      <span>
        <span className="block font-medium">{label}</span>
        {hint && <span className="block text-xs text-liquen">{hint}</span>}
      </span>
      <input
        type="checkbox"
        role="switch"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.currentTarget.checked)}
      />
      <span
        aria-hidden="true"
        className="relative h-6 w-10 shrink-0 rounded-pill bg-rama transition-colors peer-checked:bg-pico peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pico after:absolute after:top-[3px] after:left-[3px] after:size-[18px] after:rounded-pill after:bg-tenue after:transition-transform peer-checked:after:translate-x-4 peer-checked:after:bg-selva"
      />
    </label>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; hint?: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset className="px-4 py-3.5">
      <legend className="float-left mb-2.5 font-medium">{label}</legend>
      <div className="clear-both grid grid-flow-col gap-1 rounded-xl bg-selva p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer flex-col justify-center rounded-[9px] px-2 py-2 text-center text-tenue transition-colors hover:text-pluma has-checked:bg-tecla has-checked:text-pluma has-checked:shadow-[inset_0_1px_0_rgb(255_255_255/0.05)] has-focus-visible:outline-2 has-focus-visible:outline-pico"
          >
            <input
              type="radio"
              name={label}
              value={o.value}
              className="sr-only"
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span className="font-semibold">{o.label}</span>
            {o.hint && <span className="text-[11px] text-liquen">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** Grupo de ajustes: título chico afuera y, por defecto, una tarjeta con filas separadas por líneas. */
export function Section({ title, children, aside, card = true }: { title: string; children: ReactNode; aside?: ReactNode; card?: boolean }) {
  return (
    <section className="space-y-2" aria-label={title}>
      <div className="flex min-h-8 items-center justify-between gap-3 px-1">
        <h2 className="text-xs font-medium text-liquen">{title}</h2>
        {aside}
      </div>
      {card ? <Card>{children}</Card> : children}
    </section>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`divide-y divide-linea rounded-2xl border border-linea bg-hoja ${className}`}>{children}</div>;
}

export function Button({
  children,
  onClick,
  variant = 'quiet',
  type = 'button',
  size = 'md',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'quiet' | 'danger';
  type?: 'button' | 'submit';
  size?: 'sm' | 'md';
}) {
  const styles = {
    primary: 'bg-pico text-selva hover:bg-pico-hondo',
    quiet: 'border border-rama text-pluma hover:bg-tecla',
    danger: 'bg-alerta text-selva hover:brightness-110',
  } as const;
  const sizes = { sm: 'min-h-9 rounded-[10px] px-3 text-[13px]', md: 'min-h-11 rounded-xl px-4' } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1.5 font-semibold whitespace-nowrap transition-colors ${sizes[size]} ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

/** Íconos de trazo propio (24×24, currentColor). Decorativos: el texto accesible lo lleva el control. */
const paths = {
  phone: 'M9.5 2.5h5a2.5 2.5 0 0 1 2.5 2.5v14a2.5 2.5 0 0 1-2.5 2.5h-5A2.5 2.5 0 0 1 7 19V5a2.5 2.5 0 0 1 2.5-2.5zM11 18.5h2',
  refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
  chevronDown: 'M6 9l6 6 6-6',
  chevronRight: 'M9 6l6 6-6 6',
  file: 'M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14l3 3 3-3',
  up: 'M12 19V5M6 11l6-6 6 6',
  down: 'M12 5v14M6 13l6 6 6-6',
  check: 'M5 12l5 5 9-10',
  close: 'M6 6l12 12M18 6L6 18',
} as const;

export function Icon({ name, className = 'size-4' }: { name: keyof typeof paths; className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d={paths[name]} />
    </svg>
  );
}
