/** Resumen de getStats para el overlay y para los tests (R15). */
export interface StatsSummary {
  rttMs: number | null;
  fps: number | null;
  bitrateKbps: number | null;
  packetLossPct: number | null;
  framesDecoded: number;
  frameWidth: number;
  frameHeight: number;
  codec: string | null;
}

interface InboundVideo {
  type: 'inbound-rtp';
  kind?: string;
  framesDecoded?: number;
  framesPerSecond?: number;
  frameWidth?: number;
  frameHeight?: number;
  bytesReceived?: number;
  packetsReceived?: number;
  packetsLost?: number;
  codecId?: string;
  timestamp: number;
}

interface CandidatePair {
  type: 'candidate-pair';
  nominated?: boolean;
  state?: string;
  currentRoundTripTime?: number;
}

export interface PreviousSample {
  bytes: number;
  timestamp: number;
}

export function summarizeStats(report: RTCStatsReport, previous: PreviousSample | null): { summary: StatsSummary; sample: PreviousSample | null } {
  let v: InboundVideo | null = null;
  let rtt: number | null = null;
  for (const s of report.values() as IterableIterator<RTCStats>) {
    if (s.type === 'inbound-rtp' && (s as InboundVideo).kind === 'video') v = s as InboundVideo;
    if (s.type === 'candidate-pair') {
      const pair = s as CandidatePair;
      if (pair.state === 'succeeded' && pair.nominated && pair.currentRoundTripTime !== undefined) rtt = pair.currentRoundTripTime * 1000;
    }
  }
  const codecStats = v?.codecId ? (report.get(v.codecId) as { mimeType?: string } | undefined) : undefined;
  let bitrate: number | null = null;
  let sample: PreviousSample | null = null;
  if (v?.bytesReceived !== undefined) {
    sample = { bytes: v.bytesReceived, timestamp: v.timestamp };
    if (previous && v.timestamp > previous.timestamp) {
      bitrate = ((v.bytesReceived - previous.bytes) * 8) / (v.timestamp - previous.timestamp);
    }
  }
  const received = v?.packetsReceived ?? 0;
  const lost = v?.packetsLost ?? 0;
  return {
    summary: {
      rttMs: rtt === null ? null : Math.round(rtt),
      fps: v?.framesPerSecond ?? null,
      bitrateKbps: bitrate === null ? null : Math.round(bitrate),
      packetLossPct: received + lost > 0 ? Math.round((lost / (received + lost)) * 1000) / 10 : null,
      framesDecoded: v?.framesDecoded ?? 0,
      frameWidth: v?.frameWidth ?? 0,
      frameHeight: v?.frameHeight ?? 0,
      codec: codecStats?.mimeType ?? null,
    },
    sample,
  };
}
