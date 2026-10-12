import { describe, expect, it } from 'vitest';
import { orderVideoCodecs, planEncoding } from './media';

const c = (mimeType: string, sdpFmtpLine?: string) => ({ mimeType, sdpFmtpLine, clockRate: 90000 });

describe('orderVideoCodecs', () => {
  it('H.264 baseline pm=1, otros H.264 pm=1, VP8, resto', () => {
    const codecs = [
      c('video/VP8'),
      c('video/rtx', 'apt=96'),
      c('video/VP9', 'profile-id=0'),
      c('video/H264', 'level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f'),
      c('video/H264', 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f'),
      c('video/H264', 'level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f'),
      c('video/AV1'),
      c('video/red'),
    ];
    expect(orderVideoCodecs(codecs).map((x) => `${x.mimeType} ${x.sdpFmtpLine ?? ''}`.trim())).toEqual([
      'video/H264 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=42e01f',
      'video/H264 level-asymmetry-allowed=1;packetization-mode=1;profile-level-id=640c1f',
      'video/VP8',
      'video/H264 level-asymmetry-allowed=1;packetization-mode=0;profile-level-id=42e01f',
      'video/rtx apt=96',
      'video/VP9 profile-id=0',
      'video/AV1',
      'video/red',
    ]);
  });

  it('sin H.264 queda VP8 primero', () => {
    expect(orderVideoCodecs([c('video/VP9'), c('video/VP8')])[0]?.mimeType).toBe('video/VP8');
  });
});

describe('planEncoding', () => {
  it('Nítido: detail, mantiene resolución, 30 fps, 8 Mbps', () => {
    expect(planEncoding('sharp', 1080)).toEqual({
      contentHint: 'detail',
      degradationPreference: 'maintain-resolution',
      maxBitrate: 8_000_000,
      maxFramerate: 30,
      scaleResolutionDownBy: 1,
    });
  });

  it('Fluido: motion, mantiene fps, 60 fps, 15 Mbps', () => {
    expect(planEncoding('smooth', 1440)).toMatchObject({ contentHint: 'motion', degradationPreference: 'maintain-framerate', maxFramerate: 60, maxBitrate: 15_000_000, scaleResolutionDownBy: 1 });
  });

  it('Ahorro: baja hasta 720p y 3 Mbps; no agranda pantallas chicas', () => {
    expect(planEncoding('saver', 1080).scaleResolutionDownBy).toBe(1.5);
    expect(planEncoding('saver', 2160).scaleResolutionDownBy).toBe(3);
    expect(planEncoding('saver', 600).scaleResolutionDownBy).toBe(1);
    expect(planEncoding('saver', 1080).maxBitrate).toBe(3_000_000);
  });
});
