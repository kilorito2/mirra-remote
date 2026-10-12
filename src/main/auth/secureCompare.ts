import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { bytesToBase64url } from '@shared/base64url';

/** Comparación en tiempo constante incluso con largos distintos (se comparan digests). */
export function secureEqual(a: string, b: string): boolean {
  const da = createHash('sha256').update(a, 'utf8').digest();
  const db = createHash('sha256').update(b, 'utf8').digest();
  return timingSafeEqual(da, db);
}

export type RandomSource = (bytes: number) => Uint8Array;
export const cryptoRandom: RandomSource = (bytes) => randomBytes(bytes);

export function randomBase64url(bytes: number, random: RandomSource = cryptoRandom): string {
  return bytesToBase64url(random(bytes));
}

export type Clock = () => number;
export const systemClock: Clock = () => Date.now();
