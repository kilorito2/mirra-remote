import { MARK_PATH, MARK_STROKE, MARK_VIEWBOX } from '@shared/brand';

const stroke = { fill: 'none', stroke: 'currentColor', strokeWidth: MARK_STROKE, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

/** Logo de Mirra: la M tenue de fondo y un trazo que la recorre (quieto con reduced motion). */
export function MirraMark({ className = 'size-7' }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`inline-flex shrink-0 rounded-[29%] bg-pico text-selva ${className}`}>
      <svg viewBox={MARK_VIEWBOX} className="size-full">
        <path d={MARK_PATH} {...stroke} opacity={0.3} />
        <path d={MARK_PATH} {...stroke} pathLength={100} className="m-run" />
      </svg>
    </span>
  );
}
