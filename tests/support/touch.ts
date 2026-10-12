import type { CDPSession, Page } from '@playwright/test';

export interface TouchPoint {
  x: number;
  y: number;
  id?: number;
}

/** Toques reales por CDP (Input.dispatchTouchEvent): generan pointer events igual que un dedo. */
export class Touch {
  private constructor(
    private readonly cdp: CDPSession,
    private readonly page: Page,
  ) {}

  static async on(page: Page): Promise<Touch> {
    return new Touch(await page.context().newCDPSession(page), page);
  }

  private async dispatch(type: 'touchStart' | 'touchMove' | 'touchEnd', points: TouchPoint[]): Promise<void> {
    await this.cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: points.map((p, i) => ({ x: p.x, y: p.y, id: p.id ?? i, radiusX: 4, radiusY: 4, force: 1 })),
    });
  }

  async tap(x: number, y: number, holdMs = 40): Promise<void> {
    await this.dispatch('touchStart', [{ x, y }]);
    await this.page.waitForTimeout(holdMs);
    await this.dispatch('touchEnd', []);
  }

  /** Arrastre de un dedo en `steps` pasos. `holdMs` antes de mover activa el long press. */
  async drag(from: TouchPoint, to: TouchPoint, opts: { steps?: number; holdMs?: number; stepMs?: number } = {}): Promise<void> {
    const steps = opts.steps ?? 10;
    await this.dispatch('touchStart', [from]);
    if (opts.holdMs) await this.page.waitForTimeout(opts.holdMs);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      await this.dispatch('touchMove', [{ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t }]);
      await this.page.waitForTimeout(opts.stepMs ?? 16);
    }
    await this.dispatch('touchEnd', []);
  }

  /** Dos dedos: cada uno de `from[i]` a `to[i]`. Mismo desplazamiento = scroll; distancia distinta = pellizco. */
  async twoFinger(from: [TouchPoint, TouchPoint], to: [TouchPoint, TouchPoint], steps = 10): Promise<void> {
    await this.dispatch('touchStart', [{ ...from[0], id: 0 }, { ...from[1], id: 1 }]);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const lerp = (a: TouchPoint, b: TouchPoint) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      await this.dispatch('touchMove', [{ ...lerp(from[0], to[0]), id: 0 }, { ...lerp(from[1], to[1]), id: 1 }]);
      await this.page.waitForTimeout(16);
    }
    await this.dispatch('touchEnd', []);
  }

  async twoFingerTap(a: TouchPoint, b: TouchPoint): Promise<void> {
    await this.dispatch('touchStart', [{ ...a, id: 0 }, { ...b, id: 1 }]);
    await this.page.waitForTimeout(60);
    await this.dispatch('touchEnd', []);
  }
}
