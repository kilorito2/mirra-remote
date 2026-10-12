import type { NetworkInterfaceInfo } from 'node:os';
import { describe, expect, it } from 'vitest';
import { listLocalIps, pairingUrl } from './network';

const v4 = (address: string, internal = false): NetworkInterfaceInfo => ({
  address,
  netmask: '255.255.255.0',
  family: 'IPv4',
  mac: '00:00:00:00:00:00',
  internal,
  cidr: null,
});
const v6 = (address: string): NetworkInterfaceInfo => ({ ...v4('0.0.0.0'), address, family: 'IPv6', scopeid: 0 });

describe('listLocalIps', () => {
  const ifaces = {
    'Loopback Pseudo-Interface 1': [v4('127.0.0.1', true)],
    Ethernet: [v4('192.168.0.20')],
    'Wi-Fi': [v4('192.168.0.33'), v6('fe80::1')],
    Tailscale: [v4('100.101.102.103'), v6('fd7a:115c:a1e0::5')],
    'Adaptador público': [v4('203.0.113.9')],
  };

  it('solo IPs alcanzables, WiFi primero, sin link-local IPv6 ni públicas', () => {
    expect(listLocalIps(false, ifaces)).toEqual([
      { address: '192.168.0.33', iface: 'Wi-Fi', kind: 'wifi' },
      { address: '192.168.0.20', iface: 'Ethernet', kind: 'ethernet' },
      { address: '100.101.102.103', iface: 'Tailscale', kind: 'tailscale' },
      { address: 'fd7a:115c:a1e0::5', iface: 'Tailscale', kind: 'tailscale' },
    ]);
  });

  it('loopback solo en test mode, al final', () => {
    expect(listLocalIps(true, ifaces).at(-1)).toEqual({ address: '127.0.0.1', iface: 'loopback', kind: 'loopback' });
  });
});

describe('pairingUrl', () => {
  it('token en el fragment; IPv6 entre corchetes', () => {
    expect(pairingUrl('192.168.0.33', 47800, 'abc')).toBe('https://192.168.0.33:47800/#t=abc');
    expect(pairingUrl('fd7a::5', 47800, 'abc')).toBe('https://[fd7a::5]:47800/#t=abc');
  });
});
