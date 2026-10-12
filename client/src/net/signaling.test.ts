import { beforeEach, describe, expect, it } from 'vitest';
import { computeAuthHmac } from '@shared/authHmac';
import { ClientSignal } from '@shared/protocol';
import { guessDeviceName, loadCredentials, saveCredentials, takeTokenFromLocation } from './credentials';
import { SignalingClient, type Phase } from './signaling';

/** WebSocket falso: guarda lo enviado y deja simular mensajes/cierres del server. */
class FakeSocket {
  static last: FakeSocket | null = null;
  readyState = 0;
  sent: ClientSignal[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  constructor() {
    FakeSocket.last = this;
  }
  send(data: string) {
    this.sent.push(ClientSignal.parse(JSON.parse(data)));
  }
  close() {
    this.readyState = 3;
    this.onclose?.();
  }
  open() {
    this.readyState = 1;
    this.onopen?.();
  }
  receive(msg: object) {
    this.onmessage?.({ data: JSON.stringify(msg) });
  }
}

const TOKEN = 'T'.repeat(43);
const DEVICE_ID = 'd'.repeat(22);
const SECRET = 's'.repeat(43);

function setup(token: string | null = null) {
  const phases: Phase[] = [];
  const client = new SignalingClient({
    url: 'wss://test/ws',
    token,
    deviceName: 'Pixel',
    onPhase: (p) => phases.push(p),
    storage: localStorage,
    createSocket: () => new FakeSocket() as unknown as WebSocket,
  });
  client.connect();
  const ws = FakeSocket.last;
  if (!ws) throw new Error('sin socket');
  ws.open();
  return { client, ws, phases, last: () => phases.at(-1) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  localStorage.clear();
  // jsdom define WebSocket.OPEN = 1, igual que el falso.
});

describe('SignalingClient', () => {
  it('con token del QR empareja, guarda credenciales y pide sesión', async () => {
    const { ws, last } = setup(TOKEN);
    expect(ws.sent[0]).toEqual({ t: 'pair.token', v: 1, token: TOKEN, deviceName: 'Pixel' });
    expect(last()).toEqual({ kind: 'pendingApproval' });
    ws.receive({ t: 'pair.approved', deviceId: DEVICE_ID, deviceSecret: SECRET });
    ws.receive({ t: 'auth.ok', deviceId: DEVICE_ID, hostName: 'PC' });
    await flush();
    expect(loadCredentials()).toEqual({ deviceId: DEVICE_ID, deviceSecret: SECRET });
    expect(last()).toEqual({ kind: 'ready', hostName: 'PC' });
    expect(ws.sent.at(-1)).toEqual({ t: 'session.join', resume: false });
  });

  it('sin token ni credenciales pide PIN', () => {
    const { last } = setup();
    expect(last()).toEqual({ kind: 'needPairing', reason: null });
  });

  it('con credenciales responde el challenge con HMAC y nunca manda el secreto', async () => {
    saveCredentials({ deviceId: DEVICE_ID, deviceSecret: SECRET });
    const { ws } = setup();
    expect(ws.sent[0]).toEqual({ t: 'auth.hello', v: 1, deviceId: DEVICE_ID });
    const nonce = 'n'.repeat(43);
    ws.receive({ t: 'auth.challenge', nonce });
    await flush();
    await flush();
    expect(ws.sent[1]).toEqual({ t: 'auth.response', deviceId: DEVICE_ID, hmac: await computeAuthHmac(SECRET, nonce) });
    expect(JSON.stringify(ws.sent)).not.toContain(SECRET);
  });

  it('AUTH_FAILED (revocado) borra las credenciales y vuelve al emparejamiento', async () => {
    saveCredentials({ deviceId: DEVICE_ID, deviceSecret: SECRET });
    const { ws, last } = setup();
    ws.receive({ t: 'error', code: 'AUTH_FAILED', message: 'x' });
    await flush();
    expect(loadCredentials()).toBeNull();
    expect(last()).toEqual({ kind: 'needPairing', reason: { code: 'FORGOTTEN' } });
  });

  it('PIN incorrecto informa y permite reintentar en el mismo socket', async () => {
    const { client, ws, last } = setup();
    client.pairWithPin('123456');
    expect(ws.sent.at(-1)).toEqual({ t: 'pair.pin', v: 1, pin: '123456', deviceName: 'Pixel' });
    ws.receive({ t: 'error', code: 'PIN_INVALID', message: 'x' });
    await flush();
    expect(last()).toEqual({ kind: 'needPairing', reason: { code: 'PIN_INVALID' } });
  });

  it('PIN después de un bloqueo reabre el socket y lo manda', async () => {
    const { client, ws } = setup();
    ws.receive({ t: 'error', code: 'PIN_LOCKED', message: 'x', retryAfterMs: 300_000 });
    await flush();
    ws.close();
    client.pairWithPin('654321');
    const reopened = FakeSocket.last;
    reopened?.open();
    expect(reopened?.sent[0]).toEqual({ t: 'pair.pin', v: 1, pin: '654321', deviceName: 'Pixel' });
  });

  it('BUSY no reintenta solo', async () => {
    saveCredentials({ deviceId: DEVICE_ID, deviceSecret: SECRET });
    const { ws, last } = setup();
    ws.receive({ t: 'error', code: 'BUSY', message: 'x' });
    await flush();
    ws.close();
    expect(last()).toEqual({ kind: 'busy' });
  });

  it('corte inesperado: reintenta con backoff', () => {
    saveCredentials({ deviceId: DEVICE_ID, deviceSecret: SECRET });
    const { ws, last } = setup();
    ws.close();
    expect(last()).toEqual({ kind: 'offline', retryInMs: 500 });
  });
});

describe('credentials', () => {
  it('saca el token del fragment y lo borra de la URL', () => {
    const replaced: string[] = [];
    const loc = { hash: `#t=${TOKEN}`, pathname: '/', search: '' } as Location;
    const hist = { replaceState: (_s: unknown, _t: string, url: string) => replaced.push(url) } as unknown as History;
    expect(takeTokenFromLocation(loc, hist)).toBe(TOKEN);
    expect(replaced).toEqual(['/']);
  });

  it('ignora fragments que no son un token válido', () => {
    const hist = { replaceState: () => undefined } as unknown as History;
    expect(takeTokenFromLocation({ hash: '#t=corto', pathname: '/', search: '' } as Location, hist)).toBeNull();
  });

  it('credenciales corruptas se ignoran', () => {
    localStorage.setItem('kr.credentials.v1', '{"deviceId":1}');
    expect(loadCredentials()).toBeNull();
  });

  it('nombres de dispositivo legibles', () => {
    expect(guessDeviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe(
      'Safari en iPhone',
    );
    expect(guessDeviceName('Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/AP1A) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')).toBe(
      'Chrome en Pixel 8',
    );
    expect(guessDeviceName('Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36')).toBe('Chrome en Android');
  });
});
