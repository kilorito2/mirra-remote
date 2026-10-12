import { describe, expect, it } from 'vitest';
import { classifyInterface, isAllowedRemote, normalizeIp } from './ipAllowlist';

const strict = { allowLoopback: false };
const testMode = { allowLoopback: true };

describe('isAllowedRemote', () => {
  it.each([
    '10.0.0.1',
    '10.255.255.255',
    '172.16.0.1',
    '172.31.255.254',
    '192.168.1.50',
    '169.254.10.10',
    '100.64.0.1',
    '100.127.255.254',
    'fd7a:115c:a1e0::1',
    'fc00::1',
    'fe80::1',
    'fe80::1%12',
    '::ffff:192.168.0.10',
  ])('acepta privada/link-local/ULA/Tailscale %s', (ip) => {
    expect(isAllowedRemote(ip, strict)).toBe(true);
  });

  it.each([
    '8.8.8.8',
    '172.32.0.1',
    '172.15.255.255',
    '100.128.0.1',
    '100.63.255.255',
    '192.169.0.1',
    '2001:4860:4860::8888',
    '::ffff:8.8.8.8',
    '0.0.0.0',
    '::',
    '',
    'not-an-ip',
  ])('rechaza pública o inválida %s', (ip) => {
    expect(isAllowedRemote(ip, strict)).toBe(false);
    expect(isAllowedRemote(ip, testMode)).toBe(false);
  });

  it.each(['127.0.0.1', '127.1.2.3', '::1', '::ffff:127.0.0.1'])('loopback %s rechazado sin REMOTE_TEST_MODE', (ip) => {
    expect(isAllowedRemote(ip, strict)).toBe(false);
    expect(isAllowedRemote(ip, testMode)).toBe(true);
  });

  it('undefined (socket ya cerrado) se rechaza', () => {
    expect(isAllowedRemote(undefined, testMode)).toBe(false);
  });
});

describe('normalizeIp', () => {
  it('desarma IPv4-mapped y quita la zona', () => {
    expect(normalizeIp('::FFFF:10.0.0.2')).toEqual({ address: '10.0.0.2', family: 'ipv4' });
    expect(normalizeIp('FE80::1%eth0')).toEqual({ address: 'fe80::1', family: 'ipv6' });
  });
});

describe('classifyInterface', () => {
  it('detecta Tailscale por nombre o rango, WiFi y Ethernet', () => {
    expect(classifyInterface('Tailscale', { address: '100.101.1.2', family: 'ipv4' })).toBe('tailscale');
    expect(classifyInterface('Ethernet 3', { address: '100.101.1.2', family: 'ipv4' })).toBe('tailscale');
    expect(classifyInterface('Wi-Fi', { address: '192.168.0.3', family: 'ipv4' })).toBe('wifi');
    expect(classifyInterface('Ethernet', { address: '192.168.0.4', family: 'ipv4' })).toBe('ethernet');
    expect(classifyInterface('vEthernet (WSL)', { address: '172.20.0.1', family: 'ipv4' })).toBe('ethernet');
  });
});
