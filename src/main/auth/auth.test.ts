import { mkdtempSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeAuthHmac } from '@shared/authHmac';
import { PIN_LOCKOUT_MS, TOKEN_TTL_MS, NONCE_TTL_MS, PIN_TTL_MS } from '@shared/constants';
import { Token } from '@shared/protocol';
import { ApprovalGate } from './approval';
import { Challenge } from './challenge';
import { DeviceStore, type SecretCipher } from './deviceStore';
import { PairingTokens } from './pairingToken';
import { PinManager } from './pin';

function fakeClock(start = 1_000_000) {
  let now = start;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

/** Cifrado de mentira pero no identidad, para comprobar que no se guarda en claro. */
const rot: SecretCipher = {
  encrypt: (s) => 'enc:' + Buffer.from(s).toString('base64'),
  decrypt: (s) => {
    if (!s.startsWith('enc:')) throw new Error('bad');
    return Buffer.from(s.slice(4), 'base64').toString();
  },
};

describe('PairingTokens', () => {
  it('genera tokens de 32 B en base64url', () => {
    const tokens = new PairingTokens();
    expect(Token.safeParse(tokens.current().token).success).toBe(true);
  });

  it('es de un solo uso', () => {
    const tokens = new PairingTokens();
    const { token } = tokens.current();
    expect(tokens.consume(token)).toBe(true);
    expect(tokens.consume(token)).toBe(false);
    expect(tokens.current().token).not.toBe(token);
  });

  it('vence a los 2 minutos y se regenera solo', () => {
    const clock = fakeClock();
    const tokens = new PairingTokens(clock.now);
    const { token } = tokens.current();
    clock.advance(TOKEN_TTL_MS);
    expect(tokens.consume(token)).toBe(false);
    expect(tokens.current().token).not.toBe(token);
  });

  it('rechaza tokens incorrectos', () => {
    const tokens = new PairingTokens();
    expect(tokens.consume('x'.repeat(43))).toBe(false);
    expect(tokens.consume('')).toBe(false);
  });
});

describe('PinManager', () => {
  const seq = (...pins: string[]) => {
    let i = 0;
    return () => pins[i++ % pins.length] ?? '000000';
  };

  it('acepta el PIN correcto una sola vez', () => {
    const pins = new PinManager(undefined, seq('123456', '654321'));
    expect(pins.attempt('10.0.0.2', '123456')).toEqual({ ok: true });
    expect(pins.current().pin).toBe('654321');
    expect(pins.attempt('10.0.0.2', '123456').ok).toBe(false);
  });

  it('vence a los 2 minutos', () => {
    const clock = fakeClock();
    const pins = new PinManager(clock.now, seq('111111', '222222'));
    clock.advance(PIN_TTL_MS);
    expect(pins.attempt('10.0.0.2', '111111')).toEqual({ ok: false, code: 'PIN_INVALID' });
  });

  it('5 fallos desde una IP la bloquean 5 minutos (aunque después acierte)', () => {
    const clock = fakeClock();
    const pins = new PinManager(clock.now, seq('123456'));
    for (let i = 0; i < 4; i++) expect(pins.attempt('10.0.0.9', '000000')).toEqual({ ok: false, code: 'PIN_INVALID' });
    expect(pins.attempt('10.0.0.9', '000000')).toEqual({ ok: false, code: 'PIN_LOCKED', retryAfterMs: PIN_LOCKOUT_MS });
    clock.advance(60_000);
    const locked = pins.attempt('10.0.0.9', pins.current().pin);
    expect(locked).toEqual({ ok: false, code: 'PIN_LOCKED', retryAfterMs: PIN_LOCKOUT_MS - 60_000 });
    // Otra IP no está bloqueada.
    expect(pins.attempt('10.0.0.10', pins.current().pin)).toEqual({ ok: true });
  });

  it('el bloqueo se levanta a los 5 minutos', () => {
    const clock = fakeClock();
    const pins = new PinManager(clock.now, seq('123456'));
    for (let i = 0; i < 5; i++) pins.attempt('10.0.0.9', '000000');
    clock.advance(PIN_LOCKOUT_MS);
    // El PIN también venció: se pide el vigente.
    expect(pins.attempt('10.0.0.9', pins.current().pin)).toEqual({ ok: true });
  });

  it('10 fallos totales desde IPs distintas invalidan el PIN', () => {
    const rotated: string[] = [];
    const pins = new PinManager(undefined, seq('123456', '777777'), (s) => rotated.push(s.pin));
    for (let i = 0; i < 10; i++) pins.attempt(`10.0.1.${i}`, '000000');
    expect(rotated).toEqual(['777777']);
    expect(pins.attempt('10.0.2.1', '123456').ok).toBe(false);
  });

  it('genera PINs de 6 dígitos con ceros a la izquierda', () => {
    for (let i = 0; i < 50; i++) expect(new PinManager().current().pin).toMatch(/^\d{6}$/);
  });
});

describe('Challenge', () => {
  const secret = 'S'.repeat(43);

  it('acepta el HMAC correcto, calculado como en el celular', async () => {
    const challenge = new Challenge();
    const nonce = challenge.issue('dev1');
    const hmac = await computeAuthHmac(secret, nonce);
    expect(await challenge.verify('dev1', hmac, secret)).toBe(true);
  });

  it('el nonce es de un solo uso (replay rechazado)', async () => {
    const challenge = new Challenge();
    const nonce = challenge.issue('dev1');
    const hmac = await computeAuthHmac(secret, nonce);
    expect(await challenge.verify('dev1', hmac, secret)).toBe(true);
    expect(await challenge.verify('dev1', hmac, secret)).toBe(false);
  });

  it('rechaza nonce vencido, otro dispositivo, otro secreto o dispositivo inexistente', async () => {
    const clock = fakeClock();
    const make = async () => {
      const c = new Challenge(clock.now);
      return { c, hmac: await computeAuthHmac(secret, c.issue('dev1')) };
    };
    let { c, hmac } = await make();
    clock.advance(NONCE_TTL_MS);
    expect(await c.verify('dev1', hmac, secret)).toBe(false);

    ({ c, hmac } = await make());
    expect(await c.verify('dev2', hmac, secret)).toBe(false);

    ({ c, hmac } = await make());
    expect(await c.verify('dev1', hmac, 'T'.repeat(43))).toBe(false);

    ({ c, hmac } = await make());
    expect(await c.verify('dev1', hmac, null)).toBe(false);
  });

  it('sin challenge emitido no hay verificación', async () => {
    expect(await new Challenge().verify('dev1', 'x', secret)).toBe(false);
  });
});

describe('DeviceStore', () => {
  const file = () => join(mkdtempSync(join(tmpdir(), 'kr-devices-')), 'devices.json');

  it('crea, persiste cifrado, lee y revoca', () => {
    const path = file();
    const store = new DeviceStore(path, rot);
    const { deviceId, deviceSecret } = store.create('Pixel');
    expect(readFileSync(path, 'utf8')).not.toContain(deviceSecret);

    const reloaded = new DeviceStore(path, rot);
    expect(reloaded.secretFor(deviceId)).toBe(deviceSecret);
    expect(reloaded.list()).toEqual([expect.objectContaining({ id: deviceId, name: 'Pixel' })]);
    expect(JSON.stringify(reloaded.list())).not.toContain('secret');

    expect(reloaded.revoke(deviceId)).toBe(true);
    expect(reloaded.secretFor(deviceId)).toBeNull();
    expect(new DeviceStore(path, rot).has(deviceId)).toBe(false);
  });

  it('archivo corrupto se aparta y se arranca vacío', () => {
    const path = file();
    writeFileSync(path, '{basura');
    const store = new DeviceStore(path, rot);
    expect(store.list()).toEqual([]);
    expect(readdirSync(join(path, '..')).some((f) => f.includes('.corrupt-'))).toBe(true);
  });

  it('secreto ilegible = dispositivo inexistente', () => {
    const path = file();
    const store = new DeviceStore(path, rot);
    const { deviceId } = store.create('Pixel');
    const broken = new DeviceStore(path, { ...rot, decrypt: () => { throw new Error('DPAPI'); } });
    expect(broken.secretFor(deviceId)).toBeNull();
  });
});

describe('ApprovalGate', () => {
  it('aprueba o rechaza según el usuario', async () => {
    expect(await new ApprovalGate(() => Promise.resolve(true)).request('Pixel', '10.0.0.2')).toBe('approved');
    expect(await new ApprovalGate(() => Promise.resolve(false)).request('Pixel', '10.0.0.2')).toBe('rejected');
  });

  it('un diálogo a la vez', async () => {
    let resolve: (v: boolean) => void = () => undefined;
    const gate = new ApprovalGate(() => new Promise<boolean>((r) => (resolve = r)));
    const first = gate.request('A', '10.0.0.2');
    expect(await gate.request('B', '10.0.0.3')).toBe('busy');
    resolve(true);
    expect(await first).toBe('approved');
  });

  it('se rechaza solo al vencer', async () => {
    const gate = new ApprovalGate(() => new Promise<boolean>(() => undefined), 20);
    expect(await gate.request('A', '10.0.0.2')).toBe('rejected');
    expect(gate.pending).toBe(false);
  });

  it('se cancela si el celular se desconecta', async () => {
    const cancel = new AbortController();
    const gate = new ApprovalGate(() => new Promise<boolean>(() => undefined));
    const result = gate.request('A', '10.0.0.2', cancel.signal);
    cancel.abort();
    expect(await result).toBe('rejected');
  });
});
