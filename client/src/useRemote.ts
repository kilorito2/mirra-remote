import { useEffect, useState } from 'react';
import { ControlFromPc, parseJson } from '@shared/protocol';
import { SignalingClient, type Phase, type SignalingOptions } from './net/signaling';
import { PhonePeer } from './rtc/PhonePeer';
import { summarizeStats, type StatsSummary } from './rtc/stats';

export type ClientFactory = (opts: SignalingOptions) => SignalingClient;
export const defaultFactory: ClientFactory = (opts) => new SignalingClient(opts);

export type PcState = Extract<ControlFromPc, { t: 'state' }>;

export interface Remote {
  phase: Phase;
  stream: MediaStream | null;
  peerState: RTCPeerConnectionState | 'none';
  pcState: PcState | null;
  client: SignalingClient;
  peer: PhonePeer;
}

declare global {
  interface Window {
    /** Lectura de stats para el overlay y los tests E2E (no expone nada que la página no tenga). */
    __krDebug?: { stats: () => Promise<StatsSummary | null>; restart: () => void };
  }
}

/** Dueño de la conexión: signaling (WS) + PhonePeer (WebRTC), con reconexión y reanudación. */
export function useRemote(token: string | null, deviceName: string, createClient: ClientFactory): Remote {
  const [phase, setPhase] = useState<Phase>({ kind: 'connecting' });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [peerState, setPeerState] = useState<RTCPeerConnectionState | 'none'>('none');
  const [pcState, setPcState] = useState<PcState | null>(null);

  const [{ client, peer }] = useState(() => {
    // El peer se crea antes que el cliente pero usa su `send`: se enlazan por esta referencia.
    const link: { client: SignalingClient | null } = { client: null };
    const p = new PhonePeer((msg) => link.client?.send(msg), {
      onStream: setStream,
      onState: setPeerState,
      onControlMessage: (data) => {
        const msg = parseJson(ControlFromPc, data);
        if (msg?.t === 'state') setPcState(msg);
      },
    });
    const c = createClient({
      token,
      deviceName,
      onPhase: (next) => {
        setPhase(next);
        if (next.kind === 'ended' || next.kind === 'needPairing' || next.kind === 'busy') {
          p.close();
          setStream(null);
          setPeerState('none');
        }
      },
      onRtc: (msg) => {
        void p.onRtc(msg);
      },
      hasLivePeer: () => p.isAlive(),
    });
    link.client = c;
    return { client: c, peer: p };
  });

  useEffect(() => {
    client.connect();
    let sample: Parameters<typeof summarizeStats>[1] = null;
    window.__krDebug = {
      stats: async () => {
        const pc = peer.connection;
        if (!pc) return null;
        const result = summarizeStats(await pc.getStats(), sample);
        sample = result.sample;
        return result.summary;
      },
      restart: () => client.send({ t: 'rtc.restart' }),
    };
    // Al volver de segundo plano (celular bloqueado) se verifica la conexión.
    const onVisible = () => {
      if (document.visibilityState === 'visible') peer.checkHealth();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
      client.stop();
      peer.close();
    };
  }, [client, peer]);

  return { phase, stream, peerState, pcState, client, peer };
}
