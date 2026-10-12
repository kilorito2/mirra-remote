export const PROTOCOL_VERSION = 1;
export const DEFAULT_PORT = 47800;
export const WS_PATH = '/ws';

const KiB = 1024;
const MiB = 1024 * KiB;
const GiB = 1024 * MiB;

export const SECRET_BYTES = 32;
export const DEVICE_ID_BYTES = 16;
export const TOKEN_TTL_MS = 120_000;
export const PIN_TTL_MS = 120_000;
export const PIN_MAX_ATTEMPTS_PER_IP = 5;
export const PIN_LOCKOUT_MS = 300_000;
/** Fallos totales (todas las IPs) sobre un mismo PIN antes de invalidarlo: frena la rotación de IPs. */
export const PIN_MAX_TOTAL_FAILURES = 10;
export const APPROVAL_TIMEOUT_MS = 60_000;
export const NONCE_TTL_MS = 30_000;
export const UNAUTH_TIMEOUT_MS = 15_000;
export const HMAC_CONTEXT = 'kr-auth-v1:';
export const DEVICE_NAME_MAX = 40;

export const WS_MAX_PAYLOAD = 64 * KiB;
export const SDP_MAX = 48 * KiB;
export const MAX_BAD_MESSAGES = 3;

export const HEARTBEAT_INTERVAL_MS = 1_000;
export const HEARTBEAT_TIMEOUT_MS = 3_000;
export const INPUT_RATE_PER_SEC = 500;
export const INPUT_BURST = 100;
export const CURSOR_POS_INTERVAL_MS = 33;

export const TEXT_MAX = 1_000;
/** En unidades UTF-16; a 3 B por unidad queda < 256 KiB, el maxMessageSize de SCTP en Chrome. */
export const CLIPBOARD_MAX = 64 * KiB;
export const SCROLL_MAX = 1_200;

export const FILE_CHUNK_BYTES = 16 * KiB;
export const FILE_ACK_EVERY_BYTES = 1 * MiB;
export const FILE_MAX_UNACKED_BYTES = 8 * MiB;
export const FILE_BUFFER_HIGH_BYTES = 4 * MiB;
export const FILE_BUFFER_LOW_BYTES = 1 * MiB;
export const FILE_MAX_TO_PC_BYTES = 4 * GiB;
export const FILE_MAX_TO_PHONE_BYTES = 512 * MiB;
export const FILE_IPC_READ_BYTES = 256 * KiB;

export const SESSION_HOTKEY = 'Control+Alt+Shift+K';
export const DOWNLOADS_SUBDIR = 'Kilorito Remote';

export const CHANNELS = {
  inputFast: { label: 'input-fast', id: 0 },
  control: { label: 'control', id: 1 },
  file: { label: 'file', id: 2 },
} as const;

export const QUALITY_PRESETS = {
  sharp: {
    contentHint: 'detail',
    degradationPreference: 'maintain-resolution',
    maxFramerate: 30,
    maxBitrate: 8_000_000,
    maxHeight: null,
  },
  smooth: {
    contentHint: 'motion',
    degradationPreference: 'maintain-framerate',
    maxFramerate: 60,
    maxBitrate: 15_000_000,
    maxHeight: null,
  },
  saver: {
    contentHint: 'detail',
    degradationPreference: 'balanced',
    maxFramerate: 30,
    maxBitrate: 3_000_000,
    maxHeight: 720,
  },
} as const;

export type QualityPreset = keyof typeof QUALITY_PRESETS;
export const QUALITY_PRESET_NAMES = ['sharp', 'smooth', 'saver'] as const satisfies readonly QualityPreset[];
