import { computeAuthHmac } from '@shared/authHmac';
import { NONCE_TTL_MS, SECRET_BYTES } from '@shared/constants';
import { cryptoRandom, randomBase64url, secureEqual, systemClock, type Clock, type RandomSource } from './secureCompare';

interface PendingChallenge {
  deviceId: string;
  nonce: string;
  expiresAt: number;
}

/**
 * Challenge-response de una conexión: un nonce por vez, de un solo uso, vence a los 30 s.
 * El secreto nunca viaja: el celular responde HMAC(secret, contexto + nonce).
 */
export class Challenge {
  private pending: PendingChallenge | null = null;

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly random: RandomSource = cryptoRandom,
  ) {}

  issue(deviceId: string): string {
    const nonce = randomBase64url(SECRET_BYTES, this.random);
    this.pending = { deviceId, nonce, expiresAt: this.clock() + NONCE_TTL_MS };
    return nonce;
  }

  /**
   * `secret` es null si el deviceId no existe o fue revocado: igual se calcula un HMAC
   * para no distinguir por tiempo entre "no existe" y "HMAC incorrecto".
   */
  async verify(deviceId: string, hmac: string, secret: string | null): Promise<boolean> {
    const pending = this.pending;
    this.pending = null;
    if (!pending) return false;
    const expected = await computeAuthHmac(secret ?? randomBase64url(SECRET_BYTES, this.random), pending.nonce);
    const fresh = this.clock() < pending.expiresAt;
    const sameDevice = secureEqual(deviceId, pending.deviceId);
    return secureEqual(hmac, expected) && fresh && sameDevice && secret !== null;
  }
}
