/**
 * Protocolo v1 (docs/PROTOCOL.md). Fuente de verdad compartida por PC y celular.
 * Todos los objetos son `strict`: un campo de más es un mensaje inválido.
 */
import { z } from 'zod';
import {
  CLIPBOARD_MAX,
  DEVICE_ID_BYTES,
  DEVICE_NAME_MAX,
  FILE_MAX_TO_PC_BYTES,
  PROTOCOL_VERSION,
  QUALITY_PRESET_NAMES,
  SCROLL_MAX,
  SDP_MAX,
  SECRET_BYTES,
  TEXT_MAX,
} from './constants';

/** Largo en base64url sin padding de `bytes` bytes. */
export function base64urlLength(bytes: number): number {
  return Math.ceil((bytes * 4) / 3);
}

const b64url = (bytes: number) =>
  z
    .string()
    .length(base64urlLength(bytes))
    .regex(/^[A-Za-z0-9_-]+$/);

export const Token = b64url(SECRET_BYTES);
export const Nonce = b64url(SECRET_BYTES);
export const DeviceSecret = b64url(SECRET_BYTES);
export const Hmac = b64url(32);
export const DeviceId = b64url(DEVICE_ID_BYTES);
export const Pin = z.string().regex(/^\d{6}$/);

/** Sin caracteres de control ni de formato (evita RTL override en el diálogo de aprobación). */
export const DeviceName = z
  .string()
  .trim()
  .min(1)
  .max(DEVICE_NAME_MAX)
  .regex(/^[^\p{Cc}\p{Cf}\p{Co}\p{Cn}\p{Zl}\p{Zp}]+$/u);

const Version = z.literal(PROTOCOL_VERSION);

export const RtcSdp = z.string().min(1).max(SDP_MAX);
export const RtcCandidate = z
  .strictObject({
    candidate: z.string().max(1024),
    sdpMid: z.string().max(32).nullable().optional(),
    sdpMLineIndex: z.number().int().min(0).max(64).nullable().optional(),
    usernameFragment: z.string().max(256).nullable().optional(),
  })
  .nullable();

// ───────────────────────────── Signaling: celular → PC ─────────────────────────────

export const ClientSignal = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('pair.token'), v: Version, token: Token, deviceName: DeviceName }),
  z.strictObject({ t: z.literal('pair.pin'), v: Version, pin: Pin, deviceName: DeviceName }),
  z.strictObject({ t: z.literal('auth.hello'), v: Version, deviceId: DeviceId }),
  z.strictObject({ t: z.literal('auth.response'), deviceId: DeviceId, hmac: Hmac }),
  z.strictObject({ t: z.literal('session.join'), resume: z.boolean() }),
  z.strictObject({
    t: z.literal('rtc.description'),
    description: z.strictObject({ type: z.literal('answer'), sdp: RtcSdp }),
  }),
  z.strictObject({ t: z.literal('rtc.candidate'), candidate: RtcCandidate }),
  z.strictObject({ t: z.literal('rtc.restart') }),
  z.strictObject({ t: z.literal('session.end') }),
]);
export type ClientSignal = z.infer<typeof ClientSignal>;

// ───────────────────────────── Signaling: PC → celular ─────────────────────────────

export const ErrorCode = z.enum([
  'BAD_MESSAGE',
  'TOKEN_INVALID',
  'PIN_INVALID',
  'PIN_LOCKED',
  'REJECTED',
  'APPROVAL_BUSY',
  'AUTH_FAILED',
  'BUSY',
  'RATE_LIMITED',
  'INTERNAL',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const SessionEndReason = z.enum(['USER', 'HOTKEY', 'REVOKED', 'REPLACED', 'TIMEOUT', 'ERROR']);
export type SessionEndReason = z.infer<typeof SessionEndReason>;

export const ServerSignal = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('pair.pending') }),
  z.strictObject({ t: z.literal('pair.approved'), deviceId: DeviceId, deviceSecret: DeviceSecret }),
  z.strictObject({ t: z.literal('auth.challenge'), nonce: Nonce }),
  z.strictObject({ t: z.literal('auth.ok'), deviceId: DeviceId, hostName: z.string().max(64) }),
  z.strictObject({
    t: z.literal('rtc.description'),
    description: z.strictObject({ type: z.literal('offer'), sdp: RtcSdp }),
  }),
  z.strictObject({ t: z.literal('rtc.candidate'), candidate: RtcCandidate }),
  z.strictObject({ t: z.literal('session.ended'), reason: SessionEndReason }),
  z.strictObject({
    t: z.literal('error'),
    code: ErrorCode,
    message: z.string().max(200),
    retryAfterMs: z.number().int().nonnegative().optional(),
  }),
]);
export type ServerSignal = z.infer<typeof ServerSignal>;

// ───────────────────────────── DataChannels ─────────────────────────────

/** Rango aceptado; main además clampea a [0,1] (un poco de margen por redondeos del celular). */
const Coord = z.number().min(-1).max(2);
const Uint32 = z.number().int().min(0).max(0xffff_ffff);

// Literales explícitos: con `.split('')` el tipo se ensancha a string y se pierde el chequeo en compilación.
export const KEY_NAMES = [
  'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x', 'y', 'z',
  '0', '1', '2', '3', '4', '5', '6', '7', '8', '9',
  'f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9', 'f10', 'f11', 'f12',
  'escape',
  'tab',
  'enter',
  'backspace',
  'delete',
  'insert',
  'space',
  'up',
  'down',
  'left',
  'right',
  'home',
  'end',
  'pageup',
  'pagedown',
  'ctrl',
  'alt',
  'shift',
  'meta',
  'capslock',
  'printscreen',
] as const;
export const KeyName = z.enum(KEY_NAMES);
export type KeyName = z.infer<typeof KeyName>;
export const MODIFIER_KEYS = ['ctrl', 'alt', 'shift', 'meta'] as const satisfies readonly KeyName[];

export const MouseButton = z.enum(['left', 'right', 'middle']);
export type MouseButton = z.infer<typeof MouseButton>;

export const InputFastFromPhone = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('pointer.move'), seq: Uint32, x: Coord, y: Coord }),
]);
export type InputFastFromPhone = z.infer<typeof InputFastFromPhone>;

export const InputFastFromPc = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('cursor.pos'), x: z.number().min(0).max(1), y: z.number().min(0).max(1), visible: z.boolean() }),
]);
export type InputFastFromPc = z.infer<typeof InputFastFromPc>;

/** Texto imprimible: se permiten salto de línea y tab, ningún otro carácter de control. */
export function isPrintableText(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    const isControl = c < 0x20 || (c >= 0x7f && c <= 0x9f);
    if (isControl && c !== 0x0a && c !== 0x09) return false;
  }
  return true;
}

const PrintableText = (max: number) =>
  z.string().min(1).max(max).refine(isPrintableText, 'caracteres de control no permitidos');

const isSecureAttention = (keys: readonly KeyName[]) =>
  keys.includes('ctrl') && keys.includes('alt') && (keys.includes('delete') || keys.includes('end'));

export const ControlFromPhone = z.discriminatedUnion('t', [
  z.strictObject({ t: z.literal('heartbeat'), ts: z.number().nonnegative() }),
  z.strictObject({
    t: z.literal('pointer.button'),
    button: MouseButton,
    action: z.enum(['down', 'up', 'click']),
    x: Coord,
    y: Coord,
  }),
  z.strictObject({
    t: z.literal('scroll'),
    dx: z.number().int().min(-SCROLL_MAX).max(SCROLL_MAX),
    dy: z.number().int().min(-SCROLL_MAX).max(SCROLL_MAX),
  }),
  z.strictObject({ t: z.literal('key'), key: KeyName, action: z.enum(['down', 'up', 'tap']) }),
  z.strictObject({
    t: z.literal('combo'),
    keys: z
      .array(KeyName)
      .min(1)
      .max(4)
      // Ctrl+Alt+Supr (y Ctrl+Alt+Fin de RDP) es la Secure Attention Sequence: requiere el servicio nativo.
      .refine((keys) => !isSecureAttention(keys), 'Ctrl+Alt+Supr requiere el servicio nativo'),
  }),
  z.strictObject({ t: z.literal('text'), text: PrintableText(TEXT_MAX) }),
  z.strictObject({ t: z.literal('input.reset') }),
  z.strictObject({ t: z.literal('clipboard.push'), text: z.string().max(CLIPBOARD_MAX) }),
  z.strictObject({ t: z.literal('clipboard.pull') }),
  z.strictObject({ t: z.literal('display.select'), displayId: z.string().min(1).max(64) }),
  z.strictObject({ t: z.literal('quality.set'), preset: z.enum(QUALITY_PRESET_NAMES) }),
  z.strictObject({ t: z.literal('session.end') }),
]);
export type ControlFromPhone = z.infer<typeof ControlFromPhone>;

export const DisplayInfo = z.strictObject({
  id: z.string().min(1).max(64),
  label: z.string().max(128),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  scaleFactor: z.number().positive(),
  primary: z.boolean(),
});
export type DisplayInfo = z.infer<typeof DisplayInfo>;

export const ControlFromPc = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('state'),
    displays: z.array(DisplayInfo).max(16),
    activeDisplayId: z.string().max(64),
    preset: z.enum(QUALITY_PRESET_NAMES),
    audio: z.boolean(),
  }),
  z.strictObject({ t: z.literal('clipboard.data'), text: z.string().max(CLIPBOARD_MAX) }),
  z.strictObject({ t: z.literal('notice'), level: z.enum(['info', 'warn']), code: z.string().max(64) }),
]);
export type ControlFromPc = z.infer<typeof ControlFromPc>;

const FileId = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[A-Za-z0-9_-]+$/);

export const FileMessage = z.discriminatedUnion('t', [
  z.strictObject({
    t: z.literal('file.offer'),
    id: FileId,
    name: z.string().min(1).max(255),
    size: z.number().int().min(0).max(FILE_MAX_TO_PC_BYTES),
    mime: z.string().max(128),
  }),
  z.strictObject({ t: z.literal('file.ack'), id: FileId, received: z.number().int().nonnegative() }),
  z.strictObject({ t: z.literal('file.end'), id: FileId }),
  z.strictObject({ t: z.literal('file.done'), id: FileId }),
  z.strictObject({ t: z.literal('file.cancel'), id: FileId, reason: z.string().max(64).optional() }),
  z.strictObject({ t: z.literal('file.error'), id: FileId, code: z.enum(['TOO_LARGE', 'DISK', 'SIZE_MISMATCH', 'BUSY']) }),
]);
export type FileMessage = z.infer<typeof FileMessage>;

/** Parsea JSON + schema sin tirar excepciones. */
export function parseJson<T>(schema: z.ZodType<T>, raw: string): T | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
}
