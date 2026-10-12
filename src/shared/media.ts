/** Decisiones de codec y encoding (ADR-0003, R12) como funciones puras, testeables sin WebRTC. */
import { QUALITY_PRESETS, type QualityPreset } from './constants';

export interface CodecLike {
  mimeType: string;
  sdpFmtpLine?: string | undefined;
  clockRate: number;
  channels?: number | undefined;
}

function rank(codec: CodecLike): number {
  const mime = codec.mimeType.toLowerCase();
  const fmtp = codec.sdpFmtpLine?.toLowerCase() ?? '';
  if (mime === 'video/h264') {
    const pm1 = fmtp.includes('packetization-mode=1');
    // Constrained baseline (42e0xx): lo decodifica por hardware cualquier celular, incluido Safari iOS.
    const baseline = /profile-level-id=42e0/.test(fmtp);
    if (pm1 && baseline) return 0;
    if (pm1) return 1;
    return 3;
  }
  if (mime === 'video/vp8') return 2;
  // RTX, RED, ULPFEC y demás quedan detrás, en su orden original.
  return 4;
}

/** H.264 (baseline, packetization-mode=1) primero, después VP8, después el resto. Estable. */
export function orderVideoCodecs<T extends CodecLike>(codecs: readonly T[]): T[] {
  return codecs
    .map((codec, index) => ({ codec, index }))
    .sort((a, b) => rank(a.codec) - rank(b.codec) || a.index - b.index)
    .map(({ codec }) => codec);
}

export interface EncodingPlan {
  contentHint: 'detail' | 'motion';
  degradationPreference: 'maintain-resolution' | 'maintain-framerate' | 'balanced';
  maxBitrate: number;
  maxFramerate: number;
  scaleResolutionDownBy: number;
}

/** Qué aplicar con setParameters según el preset y la altura real de la captura. */
export function planEncoding(preset: QualityPreset, sourceHeight: number): EncodingPlan {
  const p = QUALITY_PRESETS[preset];
  const scale = p.maxHeight && sourceHeight > p.maxHeight ? sourceHeight / p.maxHeight : 1;
  return {
    contentHint: p.contentHint,
    degradationPreference: p.degradationPreference,
    maxBitrate: p.maxBitrate,
    maxFramerate: p.maxFramerate,
    scaleResolutionDownBy: Math.round(scale * 1000) / 1000,
  };
}
