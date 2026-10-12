import { randomInt } from 'node:crypto';
import {
  PIN_LOCKOUT_MS,
  PIN_MAX_ATTEMPTS_PER_IP,
  PIN_MAX_TOTAL_FAILURES,
  PIN_TTL_MS,
} from '@shared/constants';
import { secureEqual, systemClock, type Clock } from './secureCompare';

export interface PinState {
  pin: string;
  expiresAt: number;
}

export type PinAttempt =
  | { ok: true }
  | { ok: false; code: 'PIN_INVALID' }
  | { ok: false; code: 'PIN_LOCKED'; retryAfterMs: number };

interface IpRecord {
  failures: number;
  lockedUntil: number;
  lastAt: number;
}

export type PinGenerator = () => string;
export const cryptoPin: PinGenerator = () => String(randomInt(0, 1_000_000)).padStart(6, '0');

/**
 * PIN de 6 dígitos (alternativa al QR). Defensas:
 * - vence a los 2 min y es de un solo uso;
 * - 5 fallos desde una IP → esa IP queda bloqueada 5 min;
 * - 10 fallos en total sobre el mismo PIN (cualquier IP) → el PIN se invalida y se genera otro,
 *   así rotar IPs en la WiFi no da más de 10 intentos sobre 10⁶ combinaciones.
 */
export class PinManager {
  private state: PinState;
  private totalFailures = 0;
  private readonly ips = new Map<string, IpRecord>();

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly generate: PinGenerator = cryptoPin,
    private readonly onRotate: (state: PinState) => void = () => undefined,
  ) {
    this.state = this.fresh();
  }

  current(): PinState {
    if (this.clock() >= this.state.expiresAt) this.rotate();
    return this.state;
  }

  rotate(): PinState {
    this.state = this.fresh();
    this.totalFailures = 0;
    this.onRotate(this.state);
    return this.state;
  }

  attempt(ip: string, candidate: string): PinAttempt {
    const now = this.clock();
    this.prune(now);
    const record = this.ips.get(ip) ?? { failures: 0, lockedUntil: 0, lastAt: now };
    record.lastAt = now;

    if (record.lockedUntil > now) {
      this.ips.set(ip, record);
      return { ok: false, code: 'PIN_LOCKED', retryAfterMs: record.lockedUntil - now };
    }

    const { pin, expiresAt } = this.current();
    if (now < expiresAt && secureEqual(candidate, pin)) {
      this.ips.delete(ip);
      this.rotate();
      return { ok: true };
    }

    record.failures += 1;
    this.totalFailures += 1;
    if (this.totalFailures >= PIN_MAX_TOTAL_FAILURES) this.rotate();

    if (record.failures >= PIN_MAX_ATTEMPTS_PER_IP) {
      record.failures = 0;
      record.lockedUntil = now + PIN_LOCKOUT_MS;
      this.ips.set(ip, record);
      return { ok: false, code: 'PIN_LOCKED', retryAfterMs: PIN_LOCKOUT_MS };
    }
    this.ips.set(ip, record);
    return { ok: false, code: 'PIN_INVALID' };
  }

  /** Olvida IPs sin actividad ni bloqueo, para que el mapa no crezca sin límite. */
  private prune(now: number): void {
    for (const [ip, r] of this.ips) {
      if (r.lockedUntil <= now && now - r.lastAt > PIN_LOCKOUT_MS) this.ips.delete(ip);
    }
  }

  private fresh(): PinState {
    return { pin: this.generate(), expiresAt: this.clock() + PIN_TTL_MS };
  }
}
