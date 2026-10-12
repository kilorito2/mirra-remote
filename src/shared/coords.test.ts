import { describe, expect, it } from 'vitest';
import { dipRectToPhysical, normalizedToPhysical, physicalToNormalized } from './coords';

// Monitor de 1920×1080 físicos con escalado 100/125/150 %: Windows da bounds en DIP distintos,
// pero el rect físico (dipToScreenRect) es siempre 1920×1080.
describe.each([
  [1, { x: 0, y: 0, width: 1920, height: 1080 }],
  [1.25, { x: 0, y: 0, width: 1536, height: 864 }],
  [1.5, { x: 0, y: 0, width: 1280, height: 720 }],
])('monitor 1920×1080 al %s', (scale, dipBounds) => {
  const rect = dipRectToPhysical(dipBounds, scale, { x: 0, y: 0 });

  it('el rect físico es 1920×1080', () => {
    expect(rect).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
  });

  it('esquinas y centro', () => {
    expect(normalizedToPhysical({ x: 0, y: 0 }, rect)).toEqual({ x: 0, y: 0 });
    expect(normalizedToPhysical({ x: 1, y: 1 }, rect)).toEqual({ x: 1919, y: 1079 });
    expect(normalizedToPhysical({ x: 0.5, y: 0.5 }, rect)).toEqual({ x: 960, y: 540 });
  });
});

describe('dos monitores con distinto DPI', () => {
  // A: 1920×1080 @125 % a la izquierda (principal). B: 2560×1440 @150 % a la derecha, 200 px más abajo.
  const a = dipRectToPhysical({ x: 0, y: 0, width: 1536, height: 864 }, 1.25, { x: 0, y: 0 });
  const b = dipRectToPhysical({ x: 1536, y: 160, width: 1707, height: 960 }, 1.5, { x: 1920, y: 200 });

  it('rects físicos contiguos', () => {
    expect(a).toEqual({ x: 0, y: 0, width: 1920, height: 1080 });
    expect(b).toEqual({ x: 1920, y: 200, width: 2561, height: 1440 });
  });

  it('el mismo punto normalizado cae en el monitor elegido', () => {
    expect(normalizedToPhysical({ x: 0.5, y: 0.5 }, a)).toEqual({ x: 960, y: 540 });
    expect(normalizedToPhysical({ x: 0.5, y: 0.5 }, b)).toEqual({ x: 3200, y: 920 });
    expect(normalizedToPhysical({ x: 0, y: 0 }, b)).toEqual({ x: 1920, y: 200 });
  });

  it('ida y vuelta, y detecta cuando el cursor está en el otro monitor', () => {
    const p = normalizedToPhysical({ x: 0.25, y: 0.75 }, b);
    const back = physicalToNormalized(p, b);
    expect(back.inside).toBe(true);
    expect(back.x).toBeCloseTo(0.25, 3);
    expect(back.y).toBeCloseTo(0.75, 3);
    expect(physicalToNormalized({ x: 100, y: 100 }, b).inside).toBe(false);
  });
});

describe('clamp', () => {
  const rect = { x: 0, y: 0, width: 100, height: 100 };
  it('fuera de rango o no finito queda dentro del display', () => {
    expect(normalizedToPhysical({ x: -0.5, y: 1.7 }, rect)).toEqual({ x: 0, y: 99 });
    expect(normalizedToPhysical({ x: Number.NaN, y: Number.POSITIVE_INFINITY }, rect)).toEqual({ x: 0, y: 0 });
  });
});
