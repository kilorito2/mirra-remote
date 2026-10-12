/** Lee el token del fragment (#t=…) y lo borra de la URL y del historial. */
export function takeTokenFromLocation(loc: Location = location, hist: History = history): string | null {
  const match = /(?:^#|&)t=([A-Za-z0-9_-]{43})(?:&|$)/.exec(loc.hash);
  if (loc.hash) hist.replaceState(null, '', loc.pathname + loc.search);
  return match?.[1] ?? null;
}

/** Nombre legible para el diálogo de aprobación de la PC. */
export function guessDeviceName(ua: string = navigator.userAgent): string {
  const os = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad|Macintosh.*Mobile/.test(ua)
      ? 'iPad'
      : /Android/.test(ua)
        ? (/;\s*([^;)]+?)\s+Build\//.exec(ua)?.[1] ?? 'Android')
        : 'Navegador';
  const browser = /CriOS|Chrome\//.test(ua) ? 'Chrome' : /FxiOS|Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : '';
  const name = browser ? `${browser} en ${os}` : os;
  return name.replace(/[^\p{L}\p{N} ._()-]/gu, '').slice(0, 40) || 'Celular';
}
