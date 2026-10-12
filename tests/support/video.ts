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
export async function expectVideoFlowing(page: Page, activity?: () => Promise<void>): Promise<PageStats> {
  // La captura de Windows solo entrega frames cuando algo cambia en pantalla.
  await activity?.();
  const video = page.getByTestId('remote-video');
  await expect.poll(() => video.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 30_000 }).toBeGreaterThan(0);
  const first = await readStats(page);
  expect(first).not.toBeNull();
  // Con poco movimiento en pantalla la captura entrega pocos frames: se espera a que llegue al menos uno nuevo.
  await expect.poll(async () => (await readStats(page))?.framesDecoded ?? 0, { timeout: 15_000 }).toBeGreaterThan(first?.framesDecoded ?? 0);
  const second = await readStats(page);
  if (!second) throw new Error('sin stats');
  return second;
}

declare global {
  interface Window {
    __krDebug?: { stats: () => Promise<PageStats | null>; restart: () => void; sendControl: (msg: unknown) => void };
  }
}
