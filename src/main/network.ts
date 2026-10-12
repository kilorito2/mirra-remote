import { networkInterfaces, type NetworkInterfaceInfo } from 'node:os';
import type { LocalIp } from '@shared/uiState';
import { classifyInterface, isAllowedRemote, normalizeIp } from './server/ipAllowlist';

const KIND_ORDER = { wifi: 0, ethernet: 1, tailscale: 2, other: 3, loopback: 4 } as const;

/** IPs de esta PC a las que el celular puede llegar (privadas, link-local, ULA o Tailscale). */
export function listLocalIps(
  includeLoopback: boolean,
  interfaces: NodeJS.Dict<NetworkInterfaceInfo[]> = networkInterfaces(),
): LocalIp[] {
  const result: LocalIp[] = [];
  for (const [iface, addrs] of Object.entries(interfaces)) {
    for (const addr of addrs ?? []) {
      const ip = normalizeIp(addr.address);
      if (!ip || addr.internal) continue;
      // Link-local IPv6 necesita zona en la URL (fe80::1%12): los navegadores no la aceptan, se omite.
      if (ip.family === 'ipv6' && ip.address.startsWith('fe80:')) continue;
      if (!isAllowedRemote(ip.address, { allowLoopback: false })) continue;
      result.push({ address: ip.address, iface, kind: classifyInterface(iface, ip) });
    }
  }
  result.sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || ipv4First(a) - ipv4First(b));
  if (includeLoopback) result.push({ address: '127.0.0.1', iface: 'loopback', kind: 'loopback' });
  return result;
}

function ipv4First(ip: LocalIp): number {
  return ip.address.includes(':') ? 1 : 0;
}

export function pairingUrl(ip: string, port: number, token: string): string {
  const host = ip.includes(':') ? `[${ip}]` : ip;
  return `https://${host}:${port}/#t=${token}`;
}
