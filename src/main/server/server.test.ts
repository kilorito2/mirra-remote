import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { X509Certificate } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { computeAuthHmac } from '@shared/authHmac';
import { ServerSignal } from '@shared/protocol';
import { ApprovalGate } from '../auth/approval';
import { DeviceStore, type SecretCipher } from '../auth/deviceStore';
import { PairingTokens } from '../auth/pairingToken';
import { PinManager } from '../auth/pin';
import { SessionManager, type HostBridge } from '../session/sessionManager';
import { ensureCertificates } from './certs';
import { createHttpServer, indexStaticDir } from './httpServer';
import { MAX_UNAUTH_PER_ORIGIN } from '@shared/constants';
import { MAX_UNAUTH_CONNECTIONS, Signaling, isIpOrLocalhostHost } from './signaling';

const cipher: SecretCipher = {
  encrypt: (s) => Buffer.from(s).toString('base64'),
  decrypt: (s) => Buffer.from(s, 'base64').toString(),
};

const host: HostBridge = { start: () => undefined, signal: () => undefined, stop: () => undefined, isPeerConnected: () => false };

let port = 0;
let approve = true;
let approvalDelayMs = 0;
let tokens: PairingTokens;
let pins: PinManager;
let devices: DeviceStore;
let session: SessionManager;
let signaling: Signaling;
let caPem = '';
let close: () => Promise<void>;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'kr-server-'));
  const web = join(dir, 'web');
  mkdirSync(join(web, 'assets'), { recursive: true });
  writeFileSync(join(web, 'index.html'), '<!doctype html><title>kr</title>');
  writeFileSync(join(web, 'assets', 'app-123.js'), 'console.log(1)');
  writeFileSync(join(dir, 'secreto.txt'), 'no me sirvas');

  const cert = await ensureCertificates({ dir: join(dir, 'certs'), cipher, ips: ['192.168.1.10'] });
  caPem = cert.caCertPem;
  tokens = new PairingTokens();
  pins = new PinManager();
  devices = new DeviceStore(join(dir, 'devices.json'), cipher);
  session = new SessionManager(host, { onStatus: () => undefined, onEnded: () => undefined });
  signaling = new Signaling({
    tokens,
    pins,
    devices,
    approval: new ApprovalGate(() => new Promise((resolve) => setTimeout(() => resolve(approve), approvalDelayMs))),
    session,
    hostName: 'PC-TEST',
    allowLoopback: true,
    unauthTimeoutMs: 400,
  });
  const server = createHttpServer({ cert, files: indexStaticDir(web), allowLoopback: true });
  signaling.attach(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  close = () =>
    new Promise((resolve) => {
      signaling.close();
      server.close(() => resolve());
      server.closeAllConnections();
    });
});

afterAll(async () => {
  await close();
});

beforeEach(() => {
  approve = true;
  approvalDelayMs = 0;
  session.end('USER');
});

function get(path: string, method = 'GET'): Promise<{ status: number; headers: Record<string, string | string[] | undefined>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method, ca: caPem }, (res) => {
      let body = '';
      res.on('data', (c: Buffer) => (body += c.toString()));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

class Client {
  readonly ws: WebSocket;
  readonly messages: ServerSignal[] = [];
  closedWith: number | null = null;
  private waiters: (() => void)[] = [];

  constructor(origin = `https://127.0.0.1:${port}`) {
    this.ws = new WebSocket(`wss://127.0.0.1:${port}/ws`, { ca: caPem, origin });
    this.ws.on('message', (data: Buffer) => {
      this.messages.push(ServerSignal.parse(JSON.parse(data.toString())));
      this.notify();
    });
    this.ws.on('close', (code) => {
      this.closedWith = code;
      this.notify();
    });
    this.ws.on('error', () => this.notify());
  }

  open(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  send(msg: object): void {
    this.ws.send(JSON.stringify(msg));
  }

  async next<T extends ServerSignal['t']>(t: T): Promise<Extract<ServerSignal, { t: T }>> {
    for (;;) {
      const found = this.messages.find((m) => m.t === t);
      if (found) {
        this.messages.splice(this.messages.indexOf(found), 1);
        return found as Extract<ServerSignal, { t: T }>;
      }
      if (this.closedWith !== null) throw new Error(`cerrado (${this.closedWith}) esperando ${t}: ${JSON.stringify(this.messages)}`);
      await new Promise<void>((r) => this.waiters.push(r));
    }
  }

  async closed(): Promise<number> {
    while (this.closedWith === null) await new Promise<void>((r) => this.waiters.push(r));
    return this.closedWith;
  }

  private notify() {
    const w = this.waiters;
    this.waiters = [];
    w.forEach((f) => f());
  }
}

async function pairWithToken(name = 'Pixel de prueba') {
  const c = new Client();
  await c.open();
  c.send({ t: 'pair.token', v: 1, token: tokens.current().token, deviceName: name });
  await c.next('pair.pending');
  const creds = await c.next('pair.approved');
  await c.next('auth.ok');
  return { c, creds };
}

async function reconnect(deviceId: string, deviceSecret: string) {
  const c = new Client();
  await c.open();
  c.send({ t: 'auth.hello', v: 1, deviceId });
  const { nonce } = await c.next('auth.challenge');
  c.send({ t: 'auth.response', deviceId, hmac: await computeAuthHmac(deviceSecret, nonce) });
  return c;
}

describe('HTTP', () => {
  it('sirve index con CSP estricta y headers de seguridad', async () => {
    const res = await get('/');
    expect(res.status).toBe(200);
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('assets con hash son immutable', async () => {
    const res = await get('/assets/app-123.js');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it.each(['/../secreto.txt', '/%2e%2e/secreto.txt', '/assets/../../secreto.txt', '/C:/Windows/win.ini', '/nada'])(
    'no sale de dist-client: %s',
    async (path) => {
      const res = await get(path);
      expect(res.status).toBe(404);
      expect(res.body).not.toContain('no me sirvas');
    },
  );

  it('solo GET/HEAD', async () => {
    expect((await get('/', 'POST')).status).toBe(405);
    expect((await get('/', 'HEAD')).status).toBe(200);
  });

  it('sirve la CA para instalarla', async () => {
    const res = await get('/ca.crt');
    expect(res.headers['content-type']).toBe('application/x-x509-ca-cert');
    expect(new X509Certificate(res.body).ca).toBe(true);
  });
});

describe('Certificados', () => {
  it('servidor firmado por la CA, con SAN de IPs, CA con Name Constraints', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'kr-certs-'));
    const bundle = await ensureCertificates({ dir, cipher, ips: ['192.168.1.10', '100.100.1.2'] });
    const ca = new X509Certificate(bundle.caCertPem);
    const server = new X509Certificate(bundle.serverCertPem);
    expect(server.verify(ca.publicKey)).toBe(true);
    expect(server.checkIP('192.168.1.10')).toBe('192.168.1.10');
    expect(server.checkIP('100.100.1.2')).toBe('100.100.1.2');
    expect(server.ca).toBe(false);
    expect(ca.toLegacyObject()).toHaveProperty('ext_key_usage', undefined);
    expect(ca.toString()).toBeTruthy();

    // Reutiliza mientras las IPs estén cubiertas; regenera solo el de servidor si aparece una nueva.
    const again = await ensureCertificates({ dir, cipher, ips: ['192.168.1.10'] });
    expect(again.serverCertPem).toBe(bundle.serverCertPem);
    const moved = await ensureCertificates({ dir, cipher, ips: ['10.0.0.5'] });
    expect(moved.caCertPem).toBe(bundle.caCertPem);
    expect(moved.serverCertPem).not.toBe(bundle.serverCertPem);
    expect(new X509Certificate(moved.serverCertPem).checkIP('192.168.1.10')).toBe('192.168.1.10');
  });
});

describe('Signaling', () => {
  it('rechaza Origin ajeno (CSWSH)', async () => {
    const c = new Client('https://evil.example');
    await expect(c.open()).rejects.toThrow();
  });

  it('empareja por QR y reconecta por challenge-response', async () => {
    const { c, creds } = await pairWithToken();
    c.ws.close();
    const again = await reconnect(creds.deviceId, creds.deviceSecret);
    expect((await again.next('auth.ok')).deviceId).toBe(creds.deviceId);
    again.ws.close();
  });

  it('token reusado es rechazado', async () => {
    const { token } = tokens.current();
    const first = new Client();
    await first.open();
    first.send({ t: 'pair.token', v: 1, token, deviceName: 'A' });
    await first.next('auth.ok');
    const second = new Client();
    await second.open();
    second.send({ t: 'pair.token', v: 1, token, deviceName: 'B' });
    expect((await second.next('error')).code).toBe('TOKEN_INVALID');
    expect(await second.closed()).toBe(4403);
    first.ws.close();
  });

  it('el usuario rechaza el emparejamiento', async () => {
    approve = false;
    const c = new Client();
    await c.open();
    c.send({ t: 'pair.token', v: 1, token: tokens.current().token, deviceName: 'Intruso' });
    expect((await c.next('error')).code).toBe('REJECTED');
    expect(devices.list().some((d) => d.name === 'Intruso')).toBe(false);
  });

  it('empareja por PIN; un PIN incorrecto cierra el socket', async () => {
    const bad = new Client();
    await bad.open();
    bad.send({ t: 'pair.pin', v: 1, pin: pins.current().pin === '000000' ? '111111' : '000000', deviceName: 'PIN' });
    expect((await bad.next('error')).code).toBe('PIN_INVALID');
    expect(await bad.closed()).toBe(4403);
    const c = new Client();
    await c.open();
    c.send({ t: 'pair.pin', v: 1, pin: pins.current().pin, deviceName: 'PIN' });
    await c.next('auth.ok');
    c.ws.close();
  });

  it('dispositivo no emparejado no pasa el challenge', async () => {
    const c = await reconnect('z'.repeat(22), 'S'.repeat(43));
    expect((await c.next('error')).code).toBe('AUTH_FAILED');
    expect(await c.closed()).toBe(4403);
  });

  it('secreto incorrecto no pasa', async () => {
    const { c, creds } = await pairWithToken();
    c.ws.close();
    const bad = await reconnect(creds.deviceId, 'X'.repeat(43));
    expect((await bad.next('error')).code).toBe('AUTH_FAILED');
  });

  it('dispositivo revocado no puede reconectar', async () => {
    const { c, creds } = await pairWithToken();
    c.ws.close();
    devices.revoke(creds.deviceId);
    const again = await reconnect(creds.deviceId, creds.deviceSecret);
    expect((await again.next('error')).code).toBe('AUTH_FAILED');
  });

  it('revocar corta la sesión activa', async () => {
    const { c, creds } = await pairWithToken();
    c.send({ t: 'session.join', resume: false });
    await expect.poll(() => session.status.status).toBe('active');
    devices.revoke(creds.deviceId);
    signaling.closeDevice(creds.deviceId, 'REVOKED');
    expect((await c.next('session.ended')).reason).toBe('REVOKED');
    await expect.poll(() => session.status.status).toBe('idle');
  });

  it('un solo controlador: el segundo dispositivo recibe BUSY', async () => {
    const a = await pairWithToken('A');
    a.c.send({ t: 'session.join', resume: false });
    await expect.poll(() => session.status.status).toBe('active');
    const b = await pairWithToken('B');
    b.c.send({ t: 'session.join', resume: false });
    expect((await b.c.next('error')).code).toBe('BUSY');
    a.c.ws.close();
    await expect.poll(() => session.status.status).toBe('idle');
  });

  it('mensajes antes de autenticar no llegan a la sesión', async () => {
    const c = new Client();
    await c.open();
    c.send({ t: 'session.join', resume: false });
    expect((await c.next('error')).code).toBe('BAD_MESSAGE');
    expect(session.status.status).toBe('idle');
  });

  it('3 mensajes inválidos cierran la conexión', async () => {
    const c = new Client();
    await c.open();
    c.ws.send('{basura');
    c.ws.send(JSON.stringify({ t: 'pair.token', v: 1, token: 'corto', deviceName: 'x' }));
    c.ws.send(Buffer.from([1, 2, 3]));
    expect(await c.closed()).toBe(4400);
  });

  it('flood antes de autenticar se corta', async () => {
    const c = new Client();
    await c.open();
    for (let i = 0; i < 30; i++) c.send({ t: 'auth.hello', v: 1, deviceId: 'z'.repeat(22) });
    expect(await c.closed()).toBeGreaterThanOrEqual(4400);
  });
});

describe('Signaling: endurecimiento', () => {
  it('esperar la aprobación más que el timeout sin autenticar no corta la conexión', async () => {
    approvalDelayMs = 900; // > unauthTimeoutMs (400)
    const { c } = await pairWithToken('Lento');
    expect(c.closedWith).toBeNull();
    c.ws.close();
  });

  it('sin autenticar se corta por timeout', async () => {
    const c = new Client();
    await c.open();
    expect(await c.closed()).toBe(4401);
  });

  it(`tope de ${MAX_UNAUTH_PER_ORIGIN} conexiones sin autenticar por origen (global ${MAX_UNAUTH_CONNECTIONS})`, async () => {
    const clients: Client[] = [];
    for (let i = 0; i < MAX_UNAUTH_PER_ORIGIN; i++) {
      const c = new Client();
      await c.open();
      clients.push(c);
    }
    const extra = new Client();
    await expect(extra.open()).rejects.toThrow();
    clients.forEach((c) => c.ws.close());
  });

  it.each([
    ['192.168.0.3:47800', true],
    ['[fd7a::1]:47800', true],
    ['localhost:47800', true],
    ['127.0.0.1', true],
    ['evil.example:47800', false],
    ['192.168.0.3.evil.example', false],
    ['[::1', false],
    ['', false],
  ])('Host %s → %s (anti DNS rebinding)', (host, ok) => {
    expect(isIpOrLocalhostHost(host)).toBe(ok);
  });
});
