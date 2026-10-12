export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

/** "482913" → "482 913": dos grupos de tres se leen y dictan mejor. */
export function formatPin(pin: string): string {
  return `${pin.slice(0, 3)} ${pin.slice(3)}`;
}

const relative = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });

export function formatSince(timestamp: number, now: number): string {
  const seconds = Math.round((timestamp - now) / 1000);
  if (Math.abs(seconds) < 60) return 'recién';
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  return relative.format(Math.round(hours / 24), 'day');
}

export const KIND_LABEL = {
  wifi: 'Wi-Fi',
  ethernet: 'Ethernet',
  tailscale: 'Tailscale',
  other: 'Otra red',
  loopback: 'Esta PC (pruebas)',
} as const;

export const PRESET_LABEL = { sharp: 'Nítido', smooth: 'Fluido', saver: 'Ahorro' } as const;
export const PRESET_HINT = {
  sharp: 'Texto legible, 30 fps',
  smooth: 'Movimiento, 60 fps',
  saver: 'Redes lentas, 720p',
} as const;
