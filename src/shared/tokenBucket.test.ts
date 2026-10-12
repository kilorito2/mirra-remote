import { describe, expect, it } from 'vitest';
import { TokenBucket } from './tokenBucket';

describe('TokenBucket', () => {
  it('permite la ráfaga y después limita al ritmo sostenido', () => {
    let now = 0;
    const bucket = new TokenBucket(500, 100, () => now);
    let ok = 0;
    for (let i = 0; i < 150; i++) if (bucket.tryTake()) ok++;
    expect(ok).toBe(100);

    now += 100; // 100 ms → 50 tokens
    ok = 0;
    for (let i = 0; i < 100; i++) if (bucket.tryTake()) ok++;
    expect(ok).toBe(50);
  });

  it('nunca acumula más que la ráfaga', () => {
    let now = 0;
    const bucket = new TokenBucket(500, 100, () => now);
    now += 60_000;
    let ok = 0;
    for (let i = 0; i < 1000; i++) if (bucket.tryTake()) ok++;
    expect(ok).toBe(100);
  });

  it('~500 mensajes por segundo sostenidos', () => {
    let now = 0;
    const bucket = new TokenBucket(500, 100, () => now);
    let ok = 0;
    for (let ms = 0; ms < 10_000; ms++) {
      now = ms;
      for (let i = 0; i < 2; i++) if (bucket.tryTake()) ok++;
    }
    expect(ok).toBeGreaterThanOrEqual(5_000);
    expect(ok).toBeLessThanOrEqual(5_100);
  });
});
