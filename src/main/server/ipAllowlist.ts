import { BlockList, isIPv4, isIPv6 } from 'node:net';
import type { InterfaceKind } from '@shared/uiState';

export interface NormalizedIp {
  address: string;
  family: 'ipv4' | 'ipv6';
}

const privateRanges = new BlockList();
privateRanges.addSubnet('10.0.0.0', 8, 'ipv4');
privateRanges.addSubnet('172.16.0.0', 12, 'ipv4');
privateRanges.addSubnet('192.168.0.0', 16, 'ipv4');
privateRanges.addSubnet('169.254.0.0', 16, 'ipv4'); // link-local
privateRanges.addSubnet('100.64.0.0', 10, 'ipv4'); // CGNAT / Tailscale
privateRanges.addSubnet('fc00::', 7, 'ipv6'); // ULA (incluye Tailscale fd7a:115c:a1e0::/48)
privateRanges.addSubnet('fe80::', 10, 'ipv6'); // link-local

const loopbackRanges = new BlockList();
loopbackRanges.addSubnet('127.0.0.0', 8, 'ipv4');
loopbackRanges.addAddress('::1', 'ipv6');

/** Quita zona IPv6 (`%eth0`) y desarma IPv4-mapped (`::ffff:1.2.3.4`). */
export function normalizeIp(raw: string | undefined): NormalizedIp | null {
  if (!raw) return null;
  const address = raw.split('%')[0] ?? '';
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped?.[1] && isIPv4(mapped[1])) return { address: mapped[1], family: 'ipv4' };
  if (isIPv4(address)) return { address, family: 'ipv4' };
  if (isIPv6(address)) return { address: address.toLowerCase(), family: 'ipv6' };
  return null;
}

export function isLoopback(ip: NormalizedIp): boolean {
  return loopbackRanges.check(ip.address, ip.family);
}

/**
 * Solo IPs privadas/link-local/ULA/Tailscale. Loopback únicamente con `allowLoopback`
 * (REMOTE_TEST_MODE, que no existe en producción — ADR-0008).
 */
export function isAllowedRemote(raw: string | undefined, opts: { allowLoopback: boolean }): boolean {
  const ip = normalizeIp(raw);
  if (!ip) return false;
  if (isLoopback(ip)) return opts.allowLoopback;
  return privateRanges.check(ip.address, ip.family);
}

/** Clasifica una interfaz por nombre (Windows) y rango, para la lista de IPs de la UI. */
export function classifyInterface(name: string, ip: NormalizedIp): Exclude<InterfaceKind, 'loopback'> {
  const n = name.toLowerCase();
  if (n.includes('tailscale') || cgnatRange.check(ip.address, ip.family)) return 'tailscale';
  if (/wi-?fi|wlan|wireless|inal[aá]mbrica/.test(n)) return 'wifi';
  if (/ethernet|eth\d|^en\d|lan/.test(n)) return 'ethernet';
  return 'other';
}

const cgnatRange = new BlockList();
cgnatRange.addSubnet('100.64.0.0', 10, 'ipv4');
