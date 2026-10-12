// Genera los íconos PNG (app, tray, PWA) sin dependencias: rasterizado con supersampling + zlib.
// Motivo: la M de Mirra sobre el acento lavanda; la variante "live" de la bandeja pasa a rojo de sesión activa.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const TINTA = [0x0a, 0x0b, 0x10];
const ACENTO = [0x8b, 0x9b, 0xff];
const ALERTA = [0xff, 0x5d, 0x6c];

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

function png(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** shapes: función (u,v en [0,1]) → [r,g,b,a] o null. Supersampling 4×4. */
function render(size, shape) {
  const out = Buffer.alloc(size * size * 4);
  const ss = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const c = shape((x + (sx + 0.5) / ss) / size, (y + (sy + 0.5) / ss) / size);
          if (c) {
            r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
          }
        }
      }
      const i = (y * size + x) * 4;
      const n = ss * ss;
      out[i] = a ? Math.round(r / a) : 0;
      out[i + 1] = a ? Math.round(g / a) : 0;
      out[i + 2] = a ? Math.round(b / a) : 0;
      out[i + 3] = Math.round((a / n) * 255);
    }
  }
  return out;
}

function roundedSquare(u, v, radius) {
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - radius), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - radius), 0);
  return Math.hypot(dx, dy) <= radius;
}

// La M de Mirra en un viewBox de 48: polilínea con trazo redondo (distancia a los segmentos ≤ medio trazo).
const M_POINTS = [[12.5, 35], [12.5, 13.5], [24, 27], [35.5, 13.5], [35.5, 35]].map(([x, y]) => [x / 48, y / 48]);
const M_HALF_STROKE = 4.6 / 2 / 48;

function distToSegment(u, v, [ax, ay], [bx, by]) {
  const dx = bx - ax, dy = by - ay;
  const t = Math.max(0, Math.min(1, ((u - ax) * dx + (v - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(u - (ax + t * dx), v - (ay + t * dy));
}

function onMark(u, v, scale = 1) {
  for (let i = 0; i < M_POINTS.length - 1; i++) {
    if (distToSegment(u, v, M_POINTS[i], M_POINTS[i + 1]) <= M_HALF_STROKE * scale) return true;
  }
  return false;
}

/** Ícono de app: la M sobre el cuadrado redondeado de acento. */
function mark() {
  return (u, v) => {
    if (!roundedSquare(u, v, 0.29)) return null;
    return onMark(u, v) ? [...TINTA, 1] : [...ACENTO, 1];
  };
}

/** Bandeja (16/32 px): trazo más grueso para que se lea; en vivo el cuadrado pasa a rojo. */
function trayIcon(live) {
  return (u, v) => {
    if (!roundedSquare(u, v, 0.26)) return null;
    return onMark(u, v, 1.35) ? [...TINTA, 1] : [...(live ? ALERTA : ACENTO), 1];
  };
}

const root = join(import.meta.dirname, '..');
const build = join(root, 'build');
const pub = join(root, 'client', 'public');
const res = join(root, 'resources');
for (const dir of [build, pub, res]) mkdirSync(dir, { recursive: true });

const write = (path, size, shape) => writeFileSync(path, png(size, render(size, shape)));
write(join(build, 'icon.png'), 256, mark());
write(join(res, 'icon.png'), 256, mark());
write(join(res, 'tray-idle.png'), 16, trayIcon(false));
write(join(res, 'tray-idle@2x.png'), 32, trayIcon(false));
write(join(res, 'tray-live.png'), 16, trayIcon(true));
write(join(res, 'tray-live@2x.png'), 32, trayIcon(true));
write(join(pub, 'icon-192.png'), 192, mark());
write(join(pub, 'icon-512.png'), 512, mark());
write(join(pub, 'apple-touch-icon.png'), 180, mark());
write(join(pub, 'favicon.png'), 32, mark());
console.log('íconos generados');
