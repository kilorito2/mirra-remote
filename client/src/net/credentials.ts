import { z } from 'zod';
import { DeviceId, DeviceSecret } from '@shared/protocol';

const KEY = 'kr.credentials.v1';
const Credentials = z.strictObject({ deviceId: DeviceId, deviceSecret: DeviceSecret });
export type Credentials = z.infer<typeof Credentials>;

/**
 * Credenciales del dispositivo. Van en localStorage (pedido explícito del diseño): el secreto nunca
 * se manda de nuevo, solo se usa para firmar el challenge. localStorage es por origen (IP:puerto).
 */
export function loadCredentials(storage: Storage = localStorage): Credentials | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const parsed = Credentials.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function saveCredentials(creds: Credentials, storage: Storage = localStorage): void {
  storage.setItem(KEY, JSON.stringify(creds));
}

export function clearCredentials(storage: Storage = localStorage): void {
  storage.removeItem(KEY);
}

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
