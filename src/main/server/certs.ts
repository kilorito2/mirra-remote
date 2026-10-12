/**
 * ADR-0001: CA local (con Name Constraints) + certificado de servidor firmado por ella.
 * La CA se genera una vez; el certificado de servidor se regenera si cambian las IPs o está por vencer.
 */
import type { webcrypto } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
// tsyringe (dependencia de @peculiar/x509) exige el polyfill antes de cargar.
import 'reflect-metadata';
import * as x509 from '@peculiar/x509';
import { AsnConvert } from '@peculiar/asn1-schema';
import { GeneralName, GeneralSubtree, GeneralSubtrees, NameConstraints, id_ce_nameConstraints } from '@peculiar/asn1-x509';
import { z } from 'zod';
import type { SecretCipher } from '../auth/deviceStore';
import { systemClock, type Clock } from '../auth/secureCompare';

x509.cryptoProvider.set(globalThis.crypto);

type CryptoKey = webcrypto.CryptoKey;

const ALG = {
  name: 'RSASSA-PKCS1-v1_5',
  hash: 'SHA-256',
  publicExponent: new Uint8Array([1, 0, 1]),
  modulusLength: 2048,
} as const;

const DAY = 86_400_000;
const CA_VALIDITY_DAYS = 3650;
/** < 398 días: lo aceptan Chrome y Apple aunque la CA sea instalada por el usuario. */
const SERVER_VALIDITY_DAYS = 397;
const RENEW_BEFORE_DAYS = 30;
const MAX_SAN_IPS = 32;

/** Solo puede firmar para IPs privadas/CGNAT/loopback y `localhost` (si alguien roba la clave, no sirve para sitios reales). */
const PERMITTED_IP_RANGES = [
  '10.0.0.0/8',
  '172.16.0.0/12',
  '192.168.0.0/16',
  '169.254.0.0/16',
  '100.64.0.0/10',
  '127.0.0.0/8',
  'fc00::/7',
  'fe80::/10',
  '::1/128',
];

export interface CertBundle {
  caCertPem: string;
  serverCertPem: string;
  serverKeyPem: string;
  /** SHA-256 de la CA en hex con dos puntos, para mostrar al instalarla. */
  caFingerprint: string;
  sanIps: string[];
}

const ServerMeta = z.strictObject({ ips: z.array(z.string()), notAfter: z.number() });

export async function ensureCertificates(opts: {
  dir: string;
  cipher: SecretCipher;
  ips: readonly string[];
  clock?: Clock;
}): Promise<CertBundle> {
  const clock = opts.clock ?? systemClock;
  const { dir, cipher } = opts;
  mkdirSync(dir, { recursive: true });
  const paths = {
    caCert: join(dir, 'ca.crt'),
    caKey: join(dir, 'ca.key.enc'),
    serverCert: join(dir, 'server.crt'),
    serverKey: join(dir, 'server.key.enc'),
    serverMeta: join(dir, 'server.json'),
  };

  let ca: { cert: x509.X509Certificate; key: CryptoKey };
  if (existsSync(paths.caCert) && existsSync(paths.caKey)) {
    ca = {
      cert: new x509.X509Certificate(readFileSync(paths.caCert, 'utf8')),
      key: await importPrivateKey(cipher.decrypt(readFileSync(paths.caKey, 'utf8'))),
    };
  } else {
    ca = await createCa(clock());
    writeFileSync(paths.caCert, ca.cert.toString('pem'));
    writeFileSync(paths.caKey, cipher.encrypt(await exportPrivateKey(ca.key)), { mode: 0o600 });
  }

  const meta = readMeta(paths.serverMeta);
  const wanted = [...new Set(['127.0.0.1', '::1', ...opts.ips])];
  const covered = meta !== null && wanted.every((ip) => meta.ips.includes(ip));
  const fresh = meta !== null && meta.notAfter - clock() > RENEW_BEFORE_DAYS * DAY;
  const haveFiles = existsSync(paths.serverCert) && existsSync(paths.serverKey);

  let serverCertPem: string;
  let serverKeyPem: string;
  let sanIps: string[];
  if (covered && fresh && haveFiles) {
    serverCertPem = readFileSync(paths.serverCert, 'utf8');
    serverKeyPem = cipher.decrypt(readFileSync(paths.serverKey, 'utf8'));
    sanIps = meta.ips;
  } else {
    // Unión con las IPs anteriores para no invalidar la excepción del navegador en cada cambio de red.
    sanIps = [...new Set([...wanted, ...(meta?.ips ?? [])])].slice(0, MAX_SAN_IPS);
    const server = await createServerCert(ca, sanIps, clock());
    serverCertPem = server.cert.toString('pem');
    serverKeyPem = await exportPrivateKey(server.key);
    writeFileSync(paths.serverCert, serverCertPem);
    writeFileSync(paths.serverKey, cipher.encrypt(serverKeyPem), { mode: 0o600 });
    writeFileSync(paths.serverMeta, JSON.stringify({ ips: sanIps, notAfter: server.cert.notAfter.getTime() }));
  }

  const thumb = new Uint8Array(await ca.cert.getThumbprint('SHA-256'));
  const caFingerprint = [...thumb].map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(':');
  return { caCertPem: ca.cert.toString('pem'), serverCertPem, serverKeyPem, caFingerprint, sanIps };
}

function readMeta(path: string): z.infer<typeof ServerMeta> | null {
  if (!existsSync(path)) return null;
  try {
    return ServerMeta.parse(JSON.parse(readFileSync(path, 'utf8')));
  } catch {
    return null;
  }
}

async function createCa(now: number): Promise<{ cert: x509.X509Certificate; key: CryptoKey }> {
  const keys = await globalThis.crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const nameConstraints = new NameConstraints({
    permittedSubtrees: new GeneralSubtrees([
      ...PERMITTED_IP_RANGES.map((cidr) => new GeneralSubtree({ base: new GeneralName({ iPAddress: cidr }) })),
      new GeneralSubtree({ base: new GeneralName({ dNSName: 'localhost' }) }),
    ]),
  });
  const cert = await x509.X509CertificateGenerator.createSelfSigned({
    serialNumber: randomSerial(),
    name: 'CN=Kilorito Remote Local CA, O=Kilorito Remote',
    notBefore: new Date(now - DAY),
    notAfter: new Date(now + CA_VALIDITY_DAYS * DAY),
    keys,
    signingAlgorithm: ALG,
    extensions: [
      new x509.BasicConstraintsExtension(true, 0, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.keyCertSign | x509.KeyUsageFlags.cRLSign, true),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
      new x509.Extension(id_ce_nameConstraints, true, AsnConvert.serialize(nameConstraints)),
    ],
  });
  return { cert, key: keys.privateKey };
}

async function createServerCert(
  ca: { cert: x509.X509Certificate; key: CryptoKey },
  ips: readonly string[],
  now: number,
): Promise<{ cert: x509.X509Certificate; key: CryptoKey }> {
  const keys = await globalThis.crypto.subtle.generateKey(ALG, true, ['sign', 'verify']);
  const cert = await x509.X509CertificateGenerator.create({
    serialNumber: randomSerial(),
    subject: 'CN=Kilorito Remote',
    issuer: ca.cert.subject,
    notBefore: new Date(now - DAY),
    notAfter: new Date(now + SERVER_VALIDITY_DAYS * DAY),
    publicKey: keys.publicKey,
    signingKey: ca.key,
    signingAlgorithm: ALG,
    extensions: [
      new x509.BasicConstraintsExtension(false, undefined, true),
      new x509.KeyUsagesExtension(x509.KeyUsageFlags.digitalSignature | x509.KeyUsageFlags.keyEncipherment, true),
      new x509.ExtendedKeyUsageExtension([x509.ExtendedKeyUsage.serverAuth]),
      new x509.SubjectAlternativeNameExtension([
        { type: 'dns', value: 'localhost' },
        ...ips.map((value) => ({ type: 'ip' as const, value })),
      ]),
      await x509.SubjectKeyIdentifierExtension.create(keys.publicKey),
      await x509.AuthorityKeyIdentifierExtension.create(ca.cert),
    ],
  });
  return { cert, key: keys.privateKey };
}

function randomSerial(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[0] = (bytes[0] ?? 0) & 0x7f; // positivo
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function exportPrivateKey(key: CryptoKey): Promise<string> {
  const der = new Uint8Array(await globalThis.crypto.subtle.exportKey('pkcs8', key));
  const b64 = Buffer.from(der).toString('base64').replace(/(.{64})/g, '$1\n');
  return `-----BEGIN PRIVATE KEY-----\n${b64}\n-----END PRIVATE KEY-----\n`;
}

async function importPrivateKey(pem: string): Promise<CryptoKey> {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  return globalThis.crypto.subtle.importKey('pkcs8', Buffer.from(b64, 'base64'), ALG, false, ['sign']);
}
