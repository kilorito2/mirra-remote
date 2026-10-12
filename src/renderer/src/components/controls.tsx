import type { ReactNode } from 'react';

export function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
      <span>
        <span className="block">{label}</span>
        {hint && <span className="block text-sm text-liquen">{hint}</span>}
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
        className="relative h-6 w-11 shrink-0 rounded-pill bg-rama transition-colors peer-checked:bg-pico peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-pico after:absolute after:top-1 after:left-1 after:size-4 after:rounded-pill after:bg-pluma after:transition-transform peer-checked:after:translate-x-5 peer-checked:after:bg-selva"
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
    <fieldset>
      <legend className="mb-2">{label}</legend>
      <div className="grid grid-flow-col gap-1 rounded-xl bg-hoja p-1">
        {options.map((o) => (
          <label
            key={o.value}
            className="flex min-h-11 cursor-pointer flex-col justify-center rounded-lg px-3 py-1.5 text-center transition-colors has-checked:bg-pluma has-checked:text-selva has-focus-visible:outline-2 has-focus-visible:outline-pico"
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
            {o.hint && <span className="text-xs opacity-75">{o.hint}</span>}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Section({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="space-y-3 border-t border-rama/70 px-6 py-5" aria-label={title}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  variant = 'quiet',
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'quiet' | 'danger';
  type?: 'button' | 'submit';
}) {
  const styles = {
    primary: 'bg-pico text-selva hover:bg-pico-hondo',
    quiet: 'text-pluma underline decoration-rama underline-offset-4 hover:decoration-pico',
    danger: 'bg-alerta text-selva hover:brightness-110',
  } as const;
  return (
    <button
      type={type}
      onClick={onClick}
      className={`min-h-11 rounded-lg px-4 font-semibold whitespace-nowrap transition-colors ${styles[variant]}`}
    >
      {children}
    </button>
  );
}
