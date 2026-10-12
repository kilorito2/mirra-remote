import { SECRET_BYTES, TOKEN_TTL_MS } from '@shared/constants';
import { cryptoRandom, randomBase64url, secureEqual, systemClock, type Clock, type RandomSource } from './secureCompare';

export interface PairingTokenState {
  token: string;
  expiresAt: number;
}

/** Token del QR: 32 B aleatorios, un solo uso, vence a los 2 min y se regenera. */
export class PairingTokens {
  private state: PairingTokenState;

  constructor(
    private readonly clock: Clock = systemClock,
    private readonly random: RandomSource = cryptoRandom,
    private readonly ttlMs = TOKEN_TTL_MS,
  ) {
    this.state = this.fresh();
  }

  /** Token vigente; si venció, genera uno nuevo. */
  current(): PairingTokenState {
    if (this.clock() >= this.state.expiresAt) this.state = this.fresh();
    return this.state;
  }

  /** Consume el token si coincide y está vigente. Siempre lo rota al acertar. */
  consume(candidate: string): boolean {
    const { token, expiresAt } = this.state;
    const valid = this.clock() < expiresAt && secureEqual(candidate, token);
    if (valid) this.state = this.fresh();
    return valid;
  }

  rotate(): PairingTokenState {
    this.state = this.fresh();
    return this.state;
  }

  private fresh(): PairingTokenState {
    return { token: randomBase64url(SECRET_BYTES, this.random), expiresAt: this.clock() + this.ttlMs };
  }
}
