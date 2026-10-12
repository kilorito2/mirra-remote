import { describe, expect, it, vi } from 'vitest';
import type { SignalingPeer } from '../server/signaling';
import { SessionManager, type HostBridge } from './sessionManager';

function peer(deviceId: string): SignalingPeer & { sent: unknown[]; closed: boolean } {
  return {
    deviceId,
    deviceName: deviceId,
    ip: '10.0.0.2',
    sent: [],
    closed: false,
    send(msg) {
      this.sent.push(msg);
    },
    close() {
      this.closed = true;
    },
  };
}

function setup(peerConnected = false) {
  const host = { start: vi.fn(), signal: vi.fn(), stop: vi.fn() };
  const bridge: HostBridge = { ...host, isPeerConnected: () => peerConnected };
  const listener = { onStatus: vi.fn(), onEnded: vi.fn() };
  return { host, listener, sessions: new SessionManager(bridge, listener) };
}

describe('SessionManager', () => {
  it('un solo controlador', () => {
    const { sessions } = setup();
    expect(sessions.join(peer('a'), false)).toBe(true);
    expect(sessions.join(peer('b'), false)).toBe(false);
  });

  it('join repetido en el mismo socket no reinicia el host', () => {
    const { sessions, host } = setup();
    const p = peer('a');
    sessions.join(p, false);
    sessions.join(p, false);
    expect(host.start).toHaveBeenCalledTimes(1);
  });

  it('el mismo dispositivo reemplaza su conexión vieja', () => {
    const { sessions } = setup();
    const old = peer('a');
    sessions.join(old, false);
    sessions.join(peer('a'), true);
    expect(old.closed).toBe(true);
    expect(old.sent).toContainEqual({ t: 'session.ended', reason: 'REPLACED' });
  });

  it('sin WebRTC vivo, cerrar el WS termina la sesión', () => {
    const { sessions, listener, host } = setup(false);
    const p = peer('a');
    sessions.join(p, false);
    sessions.peerClosed(p);
    expect(sessions.status.status).toBe('idle');
    expect(listener.onEnded).toHaveBeenCalledWith('TIMEOUT');
    expect(host.stop).toHaveBeenCalled();
  });

  it('con WebRTC vivo, espera a que el WS vuelva', () => {
    const { sessions } = setup(true);
    const p = peer('a');
    sessions.join(p, false);
    sessions.peerClosed(p);
    expect(sessions.status.status).toBe('active');
    expect(sessions.join(peer('a'), true)).toBe(true);
    sessions.end('USER');
  });

  it('session.end del celular corta con USER', () => {
    const { sessions, listener } = setup();
    const p = peer('a');
    sessions.join(p, false);
    sessions.signal(p, { t: 'session.end' });
    expect(listener.onEnded).toHaveBeenCalledWith('USER');
    expect(p.sent).toContainEqual({ t: 'session.ended', reason: 'USER' });
  });

  it('otro socket no puede mandar señales a la sesión', () => {
    const { sessions, host } = setup();
    sessions.join(peer('a'), false);
    sessions.signal(peer('a'), { t: 'rtc.restart' });
    expect(host.signal).not.toHaveBeenCalled();
  });
});
