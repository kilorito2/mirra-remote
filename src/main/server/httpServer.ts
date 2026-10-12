import { createServer, type Server } from 'node:https';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { Socket } from 'node:net';
import { extname, join, relative, sep } from 'node:path';
import type { CertBundle } from './certs';
import { isAllowedRemote } from './ipAllowlist';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
].join('; ');

const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'X-Frame-Options': 'DENY',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
};

interface StaticFile {
  body: Buffer;
  type: string;
  immutable: boolean;
}

/**
 * Índice de `dist-client` en memoria, armado al arrancar: solo se sirven archivos que existían ahí,
 * así ninguna URL (`..`, `%2e%2e`, rutas absolutas) puede llegar a otro archivo del disco.
 */
export function indexStaticDir(dir: string): Map<string, StaticFile> {
  const files = new Map<string, StaticFile>();
  const walk = (current: string) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const full = join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && statSync(full).size < 20 * 1024 * 1024) {
        const urlPath = '/' + relative(dir, full).split(sep).join('/');
        files.set(urlPath, {
          body: readFileSync(full),
          type: CONTENT_TYPES[extname(full).toLowerCase()] ?? 'application/octet-stream',
          immutable: urlPath.startsWith('/assets/'),
        });
      }
    }
  };
  walk(dir);
  return files;
}

export interface HttpServerOptions {
  cert: CertBundle;
  files: Map<string, StaticFile>;
  allowLoopback: boolean;
}

export function createHttpServer(opts: HttpServerOptions): Server {
  const server = createServer({
    cert: opts.cert.serverCertPem,
    key: opts.cert.serverKeyPem,
    minVersion: 'TLSv1.2',
  });

  // Filtro antes del handshake TLS: lo que no viene de la LAN/Tailscale ni siquiera negocia.
  server.on('connection', (socket) => {
    const remote = socket instanceof Socket ? socket.remoteAddress : undefined;
    if (!isAllowedRemote(remote, { allowLoopback: opts.allowLoopback })) socket.destroy();
  });
  server.on('tlsClientError', (_err, socket) => socket.destroy());
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;

  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    handleRequest(req, res, opts);
  });
  return server;
}

function handleRequest(req: IncomingMessage, res: ServerResponse, opts: HttpServerOptions): void {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.setHeader(k, v);
  res.setHeader('Strict-Transport-Security', 'max-age=31536000');

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }
  const path = (req.url ?? '/').split('?')[0] ?? '/';

  if (path === '/ca.crt') {
    send(res, req, Buffer.from(opts.cert.caCertPem), 'application/x-x509-ca-cert', 'no-store', {
      'Content-Disposition': 'attachment; filename="kilorito-remote-ca.crt"',
    });
    return;
  }

  const file = opts.files.get(path === '/' ? '/index.html' : path);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('No encontrado');
    return;
  }
  send(res, req, file.body, file.type, file.immutable ? 'public, max-age=31536000, immutable' : 'no-store');
}

function send(
  res: ServerResponse,
  req: IncomingMessage,
  body: Buffer,
  type: string,
  cache: string,
  extra: Record<string, string> = {},
): void {
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': body.length, 'Cache-Control': cache, ...extra });
  res.end(req.method === 'HEAD' ? undefined : body);
}
