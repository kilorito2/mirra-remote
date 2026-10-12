// Genera los íconos PNG (app, tray, PWA) sin dependencias: rasterizado con supersampling + zlib.
// Motivo: el ojo de un lorito sobre fondo selva; la variante "live" suma el aro rojo de sesión activa.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const SELVA = [0x0f, 0x26, 0x24];
const HOJA = [0x24, 0x50, 0x4b];
const PICO = [0xf2, 0xb3, 0x3d];
const ALERTA = [0xff, 0x5a, 0x4e];

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

const dist = (u, v, cx, cy) => Math.hypot(u - cx, v - cy);

function roundedSquare(u, v, radius) {
  const dx = Math.max(Math.abs(u - 0.5) - (0.5 - radius), 0);
  const dy = Math.max(Math.abs(v - 0.5) - (0.5 - radius), 0);
  return Math.hypot(dx, dy) <= radius;
}

function eye(live, { padded }) {
  return (u, v) => {
    if (live && padded && Math.abs(dist(u, v, 0.5, 0.5) - 0.44) < 0.05) return [...ALERTA, 1];
    const inset = padded ? 0.1 : 0;
    const su = (u - inset) / (1 - 2 * inset);
    const sv = (v - inset) / (1 - 2 * inset);
    if (su < 0 || su > 1 || sv < 0 || sv > 1) return null;
    if (!padded && !roundedSquare(su, sv, 0.22)) return null;
    if (padded && dist(su, sv, 0.5, 0.5) > 0.5) return null;
    const d = dist(su, sv, 0.5, 0.52);
    if (d < 0.12 && dist(su, sv, 0.56, 0.47) < 0.12) return [...SELVA, 1]; // pupila
    if (d < 0.27) return [...PICO, 1]; // iris
    if (d < 0.33) return [...HOJA, 1]; // anillo de piel
    return [...SELVA, 1];
  };
}

function trayIcon(live) {
  return (u, v) => {
    const d = dist(u, v, 0.5, 0.5);
    if (live && d > 0.36 && d <= 0.5) return [...ALERTA, 1];
    if (d < 0.17 && dist(u, v, 0.56, 0.46) < 0.16) return [...SELVA, 1];
    if (d <= (live ? 0.33 : 0.48)) return [...(live ? ALERTA : PICO), 1];
    return null;
  };
}

const root = join(import.meta.dirname, '..');
const build = join(root, 'build');
const pub = join(root, 'client', 'public');
const res = join(root, 'resources');
for (const dir of [build, pub, res]) mkdirSync(dir, { recursive: true });

const write = (path, size, shape) => writeFileSync(path, png(size, render(size, shape)));
write(join(build, 'icon.png'), 256, eye(false, { padded: false }));
write(join(res, 'icon.png'), 256, eye(false, { padded: false }));
write(join(res, 'tray-idle.png'), 16, trayIcon(false));
write(join(res, 'tray-idle@2x.png'), 32, trayIcon(false));
write(join(res, 'tray-live.png'), 16, trayIcon(true));
write(join(res, 'tray-live@2x.png'), 32, trayIcon(true));
write(join(pub, 'icon-192.png'), 192, eye(false, { padded: false }));
write(join(pub, 'icon-512.png'), 512, eye(false, { padded: false }));
write(join(pub, 'apple-touch-icon.png'), 180, eye(false, { padded: false }));
write(join(pub, 'favicon.png'), 32, eye(false, { padded: false }));
console.log('íconos generados');
