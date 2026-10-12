import { existsSync } from 'node:fs';
import { extname, join } from 'node:path';

const RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])(\..*)?$/i;

/**
 * Nombre seguro para Windows a partir del que manda el celular (R24): sin rutas, sin caracteres
 * reservados ni de control, sin nombres de dispositivo (CON, NUL…), sin punto o espacio final.
 */
export function sanitizeFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  let name = withoutControls(base)
    .normalize('NFC')
    .replace(/[<>:"|?*]/g, '_')
    .trim()
    .replace(/[. ]+$/, '');
  if (!name || name === '.' || name === '..') name = 'archivo';
  if (RESERVED.test(name)) name = `_${name}`;
  if (name.length > 180) {
    const ext = extname(name).slice(0, 20);
    name = name.slice(0, 180 - ext.length) + ext;
  }
  return name;
}

/** Sin caracteres de control ni marcas bidi (U+202A–202E, U+2066–2069: "gpj.exe" que se ve como "exe.jpg"). */
function withoutControls(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    const control = c < 0x20 || (c >= 0x7f && c <= 0x9f);
    const bidi = (c >= 0x202a && c <= 0x202e) || (c >= 0x2066 && c <= 0x2069);
    if (!control && !bidi) out += ch;
  }
  return out;
}

/** "foto.jpg" → "foto (1).jpg" si ya existe. */
export function uniquePath(dir: string, name: string, exists: (p: string) => boolean = existsSync): string {
  const ext = extname(name);
  const stem = ext ? name.slice(0, -ext.length) : name;
  let candidate = join(dir, name);
  for (let i = 1; exists(candidate) || exists(`${candidate}.part`); i++) candidate = join(dir, `${stem} (${i})${ext}`);
  return candidate;
}
