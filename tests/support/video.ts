import { expect, type Page } from '@playwright/test';

export interface PageStats {
  framesDecoded: number;
  frameWidth: number;
  frameHeight: number;
  codec: string | null;
  fps: number | null;
  rttMs: number | null;
}

export async function readStats(page: Page): Promise<PageStats | null> {
  return page.evaluate(async () => {
    const stats = await window.__krDebug?.stats();
    return stats ?? null;
  });
}

/** R10/criterio de Fase 2: llega video (videoWidth > 0) y `framesDecoded` sube. */
export async function expectVideoFlowing(page: Page): Promise<PageStats> {
  const video = page.getByTestId('remote-video');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  const first = await readStats(page);
  await page.waitForTimeout(1500);
  const second = await readStats(page);
  expect(first).not.toBeNull();
  expect(second?.framesDecoded ?? 0).toBeGreaterThan(first?.framesDecoded ?? 0);
  if (!second) throw new Error('sin stats');
  return second;
}

declare global {
  interface Window {
    __krDebug?: { stats: () => Promise<PageStats | null>; restart: () => void };
  }
}
