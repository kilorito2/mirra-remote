import { describe, expect, it } from 'vitest';
import { bytesToBase64url, base64urlToBytes } from './base64url';
import {
  ClientSignal,
  ControlFromPhone,
  DeviceName,
  FileMessage,
  InputFastFromPhone,
  ServerSignal,
  base64urlLength,
  isPrintableText,
  parseJson,
} from './protocol';

const token = 'A'.repeat(43);
const deviceId = 'b'.repeat(22);

describe('base64url', () => {
  it('ida y vuelta para todos los largos relevantes', () => {
    for (const n of [0, 1, 2, 3, 16, 32]) {
      const bytes = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 250) % 256);
      const text = bytesToBase64url(bytes);
      expect(text).toHaveLength(base64urlLength(n));
      expect(text).toMatch(/^[A-Za-z0-9_-]*$/);
      expect(base64urlToBytes(text)).toEqual(bytes);
    }
  });

  it('rechaza caracteres fuera del alfabeto', () => {
    expect(() => base64urlToBytes('ab+c')).toThrow();
  });
});

describe('ClientSignal', () => {
  it('acepta un pair.token válido', () => {
    expect(ClientSignal.safeParse({ t: 'pair.token', v: 1, token, deviceName: 'Chrome en Android' }).success).toBe(true);
  });

  it('rechaza campos extra (strict)', () => {
    expect(ClientSignal.safeParse({ t: 'pair.token', v: 1, token, deviceName: 'x', admin: true }).success).toBe(false);
  });

  it('rechaza versión distinta', () => {
    expect(ClientSignal.safeParse({ t: 'auth.hello', v: 2, deviceId }).success).toBe(false);
  });

  it('rechaza tokens con largo o alfabeto inválido', () => {
    expect(ClientSignal.safeParse({ t: 'pair.token', v: 1, token: 'A'.repeat(42), deviceName: 'x' }).success).toBe(false);
    expect(ClientSignal.safeParse({ t: 'pair.token', v: 1, token: '+'.repeat(43), deviceName: 'x' }).success).toBe(false);
  });

  it('PIN de exactamente 6 dígitos', () => {
    const ok = (pin: string) => ClientSignal.safeParse({ t: 'pair.pin', v: 1, pin, deviceName: 'x' }).success;
    expect(ok('012345')).toBe(true);
    expect(ok('12345')).toBe(false);
    expect(ok('1234567')).toBe(false);
    expect(ok('12345a')).toBe(false);
  });

  it('el celular solo puede mandar answers', () => {
    expect(ClientSignal.safeParse({ t: 'rtc.description', description: { type: 'answer', sdp: 'v=0' } }).success).toBe(true);
    expect(ClientSignal.safeParse({ t: 'rtc.description', description: { type: 'offer', sdp: 'v=0' } }).success).toBe(false);
  });

  it('acepta fin de candidatos (null)', () => {
    expect(ClientSignal.safeParse({ t: 'rtc.candidate', candidate: null }).success).toBe(true);
  });

  it('rechaza SDP gigante', () => {
    const sdp = 'a'.repeat(49 * 1024);
    expect(ClientSignal.safeParse({ t: 'rtc.description', description: { type: 'answer', sdp } }).success).toBe(false);
  });
});

describe('DeviceName', () => {
  it('recorta espacios y limita a 40', () => {
    expect(DeviceName.parse('  iPhone  ')).toBe('iPhone');
    expect(DeviceName.safeParse('x'.repeat(41)).success).toBe(false);
  });

  it('rechaza caracteres de control y bidi override (spoofing del diálogo)', () => {
    expect(DeviceName.safeParse('Pixel\u0007').success).toBe(false);
    expect(DeviceName.safeParse('Pixel‮exe').success).toBe(false);
    expect(DeviceName.safeParse('Pixel\nfalso').success).toBe(false);
    expect(DeviceName.safeParse('Teléfono de Ñandú').success).toBe(true);
  });
});

describe('ServerSignal', () => {
  it('error con código del enum', () => {
    expect(ServerSignal.safeParse({ t: 'error', code: 'PIN_LOCKED', message: 'x', retryAfterMs: 1000 }).success).toBe(true);
    expect(ServerSignal.safeParse({ t: 'error', code: 'NOPE', message: 'x' }).success).toBe(false);
  });
});

describe('DataChannels', () => {
  it('pointer.move con seq uint32 y coordenadas finitas', () => {
    expect(InputFastFromPhone.safeParse({ t: 'pointer.move', seq: 1, x: 0.5, y: 0.5 }).success).toBe(true);
    expect(InputFastFromPhone.safeParse({ t: 'pointer.move', seq: -1, x: 0.5, y: 0.5 }).success).toBe(false);
    expect(InputFastFromPhone.safeParse({ t: 'pointer.move', seq: 2 ** 32, x: 0.5, y: 0.5 }).success).toBe(false);
    expect(InputFastFromPhone.safeParse({ t: 'pointer.move', seq: 1, x: Number.NaN, y: 0 }).success).toBe(false);
    expect(InputFastFromPhone.safeParse({ t: 'pointer.move', seq: 1, x: 1e9, y: 0 }).success).toBe(false);
  });

  it('clic siempre con coordenadas', () => {
    expect(ControlFromPhone.safeParse({ t: 'pointer.button', button: 'left', action: 'click', x: 0.1, y: 0.2 }).success).toBe(true);
    expect(ControlFromPhone.safeParse({ t: 'pointer.button', button: 'left', action: 'click' }).success).toBe(false);
  });

  it('rechaza Ctrl+Alt+Supr en cualquier orden', () => {
    const combo = (keys: string[]) => ControlFromPhone.safeParse({ t: 'combo', keys }).success;
    expect(combo(['ctrl', 'alt', 'delete'])).toBe(false);
    expect(combo(['delete', 'alt', 'ctrl'])).toBe(false);
    expect(combo(['ctrl', 'alt', 'end'])).toBe(false);
    expect(combo(['ctrl', 'shift', 'escape'])).toBe(true);
    expect(combo(['meta', 'l'])).toBe(true);
    expect(combo(['ctrl', 'a', 'b', 'c', 'd'])).toBe(false);
  });

  it('teclas solo de la lista blanca', () => {
    expect(ControlFromPhone.safeParse({ t: 'key', key: 'f12', action: 'tap' }).success).toBe(true);
    expect(ControlFromPhone.safeParse({ t: 'key', key: 'f13', action: 'tap' }).success).toBe(false);
    expect(ControlFromPhone.safeParse({ t: 'key', key: 'sleep', action: 'tap' }).success).toBe(false);
  });

  it('texto unicode sí, controles no', () => {
    const text = (t: string) => ControlFromPhone.safeParse({ t: 'text', text: t }).success;
    expect(text('ñandú @ 5 €')).toBe(true);
    expect(text('línea\nnueva\ttab')).toBe(true);
    expect(text('beep\u0007')).toBe(false);
    expect(text('')).toBe(false);
    expect(text('x'.repeat(1001))).toBe(false);
  });

  it('scroll entero y acotado', () => {
    expect(ControlFromPhone.safeParse({ t: 'scroll', dx: 0, dy: -120 }).success).toBe(true);
    expect(ControlFromPhone.safeParse({ t: 'scroll', dx: 0, dy: 1.5 }).success).toBe(false);
    expect(ControlFromPhone.safeParse({ t: 'scroll', dx: 0, dy: 5000 }).success).toBe(false);
  });

  it('file.offer con id seguro y tamaño máximo', () => {
    const offer = { t: 'file.offer', id: 'abc_1', name: 'foto.jpg', size: 10, mime: 'image/jpeg' };
    expect(FileMessage.safeParse(offer).success).toBe(true);
    expect(FileMessage.safeParse({ ...offer, id: '../x' }).success).toBe(false);
    expect(FileMessage.safeParse({ ...offer, size: 5 * 1024 ** 3 }).success).toBe(false);
  });
});

describe('helpers', () => {
  it('isPrintableText', () => {
    expect(isPrintableText('hola\n')).toBe(true);
    expect(isPrintableText('\u0085')).toBe(false);
  });

  it('parseJson nunca tira', () => {
    expect(parseJson(ClientSignal, '{not json')).toBeNull();
    expect(parseJson(ClientSignal, '{"t":"session.end"}')).toEqual({ t: 'session.end' });
  });
});
