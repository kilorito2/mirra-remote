import { useEffect, useRef, useState } from 'react';
import { QUALITY_PRESET_NAMES, type QualityPreset } from '@shared/constants';
import type { PhoneFiles, PhoneTransfer } from '../files/PhoneFiles';
import type { InputSender } from '../input/InputSender';
import { summarizeStats, type PreviousSample, type StatsSummary } from '../rtc/stats';
import type { PcState } from '../useRemote';

const btn = 'min-h-11 rounded-lg bg-hoja px-4 font-semibold text-pluma active:bg-rama aria-pressed:bg-pico aria-pressed:text-selva';
const primary = 'min-h-11 rounded-lg bg-pico px-4 font-semibold text-selva active:bg-pico-hondo';

/** R15: RTT, fps, bitrate y pérdida, cada segundo. */
export function StatsOverlay({ pc }: { pc: () => RTCPeerConnection | null }) {
  const [stats, setStats] = useState<StatsSummary | null>(null);
  useEffect(() => {
    let sample: PreviousSample | null = null;
    const id = setInterval(() => {
      const conn = pc();
      if (!conn) return;
      void conn.getStats().then((report) => {
        const r = summarizeStats(report, sample);
        sample = r.sample;
        setStats(r.summary);
      });
    }, 1000);
    return () => clearInterval(id);
  }, [pc]);
  if (!stats) return null;
  const row = (label: string, value: string) => (
    <div className="flex justify-between gap-4">
      <dt className="text-liquen">{label}</dt>
      <dd className="tabular-nums">{value}</dd>
    </div>
  );
  return (
    <dl
      aria-label="Estadísticas de la conexión"
      className="pointer-events-none fixed top-3 left-3 z-20 min-w-44 rounded-xl bg-selva/85 px-3 py-2 text-sm backdrop-blur"
    >
      {row('RTT', stats.rttMs === null ? '—' : `${stats.rttMs} ms`)}
      {row('fps', stats.fps === null ? '—' : String(Math.round(stats.fps)))}
      {row('Bitrate', stats.bitrateKbps === null ? '—' : `${(stats.bitrateKbps / 1000).toFixed(1)} Mb/s`)}
      {row('Pérdida', stats.packetLossPct === null ? '—' : `${stats.packetLossPct} %`)}
      {row('Video', `${stats.frameWidth}×${stats.frameHeight}`)}
      {row('Codec', stats.codec?.replace('video/', '') ?? '—')}
    </dl>
  );
}

/** R26: la pantalla del celular no se apaga durante la sesión (se vuelve a pedir al volver de segundo plano). */
export function useWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const request = () => {
      if (!('wakeLock' in navigator) || document.visibilityState !== 'visible') return;
      navigator.wakeLock.request('screen').then(
        (l) => {
          lock = l;
        },
        () => undefined,
      );
    };
    request();
    document.addEventListener('visibilitychange', request);
    return () => {
      document.removeEventListener('visibilitychange', request);
      void lock?.release();
    };
  }, []);
}

/** R23: portapapeles de texto en ambos sentidos. Si el navegador no deja leer/escribir, se puede pegar o copiar a mano. */
export function ClipboardSheet({ sender, pcClipboard }: { sender: InputSender; pcClipboard: { text: string; at: number } | null }) {
  const [draft, setDraft] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const requested = useRef(0);

  // Cuando llega el texto pedido a la PC, se intenta copiarlo directo.
  useEffect(() => {
    if (!pcClipboard || pcClipboard.at < requested.current) return;
    navigator.clipboard.writeText(pcClipboard.text).then(
      () => setStatus('Copiado en el celular.'),
      () => setStatus('Llegó el texto: tocá "Copiar" para guardarlo en el celular.'),
    );
  }, [pcClipboard]);

  const sendToPc = async () => {
    let text = draft;
    if (!text) {
      try {
        text = await navigator.clipboard.readText();
      } catch {
        setStatus('El navegador no dejó leer el portapapeles. Pegá el texto en el cuadro y volvé a tocar.');
        return;
      }
    }
    if (!text) {
      setStatus('No hay texto para mandar.');
      return;
    }
    sender.clipboardPush(text);
    setDraft('');
    setStatus('Listo: está en el portapapeles de la PC.');
  };

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="text-sm text-liquen">Texto (opcional: si lo dejás vacío se usa el portapapeles del celular)</span>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.currentTarget.value)}
          rows={3}
          className="mt-1 w-full rounded-lg border border-rama bg-hoja p-2"
          data-testid="clipboard-draft"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={primary} onClick={() => void sendToPc()}>
          Mandar a la PC
        </button>
        <button
          type="button"
          className={btn}
          onClick={() => {
            requested.current = Date.now();
            setStatus('Pidiendo el portapapeles de la PC…');
            sender.clipboardPull();
          }}
        >
          Traer de la PC
        </button>
      </div>
      {pcClipboard && (
        <div className="rounded-lg border border-rama p-2">
          <p className="max-h-24 overflow-auto text-sm break-words whitespace-pre-wrap" data-testid="pc-clipboard">
            {pcClipboard.text || '(vacío)'}
          </p>
          <button type="button" className={`${btn} mt-2`} onClick={() => void navigator.clipboard.writeText(pcClipboard.text).then(() => setStatus('Copiado en el celular.'))}>
            Copiar
          </button>
        </div>
      )}
      {status && (
        <p role="status" className="text-sm text-liquen">
          {status}
        </p>
      )}
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const STATE_TEXT: Record<PhoneTransfer['state'], string> = { running: '', done: 'Listo', cancelled: 'Cancelado', error: 'Falló' };

/** R24/R25: mandar archivos a la PC y ver lo que llega de la PC (se descarga solo). */
export function FilesSheet({ files, transfers }: { files: PhoneFiles; transfers: PhoneTransfer[] }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-3">
      <p className="text-sm text-liquen">Lo que mandes queda en Descargas › Kilorito Remote en la PC. Lo que mande la PC se descarga acá.</p>
      <input
        ref={input}
        type="file"
        multiple
        className="sr-only"
        data-testid="file-input"
        onChange={(e) => {
          for (const f of Array.from(e.currentTarget.files ?? [])) files.send(f, f.name);
          e.currentTarget.value = '';
        }}
      />
      <button type="button" className={primary} onClick={() => input.current?.click()}>
        Elegir archivos para la PC
      </button>
      {transfers.length > 0 && (
        <ul className="space-y-2" aria-label="Transferencias">
          {[...transfers].reverse().map((t) => (
            <li key={t.id} className="rounded-lg bg-hoja p-2">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate">
                  {t.direction === 'toPc' ? '↑ ' : '↓ '}
                  {t.name}
                </span>
                {t.state === 'running' ? (
                  <button type="button" className="min-h-11 shrink-0 px-2 text-sm font-semibold text-alerta" onClick={() => files.cancel(t.id)}>
                    Cancelar
                  </button>
                ) : (
                  <span className="shrink-0 text-sm text-liquen">{STATE_TEXT[t.state]}</span>
                )}
              </div>
              <progress className="mt-1 h-1.5 w-full accent-pico" max={Math.max(1, t.size)} value={t.done} aria-label={`Progreso de ${t.name}`} />
              <span className="text-xs text-liquen tabular-nums">
                {formatBytes(t.done)} de {formatBytes(t.size)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const PRESET_LABEL: Record<QualityPreset, string> = { sharp: 'Nítido', smooth: 'Fluido', saver: 'Ahorro' };

/** Pantalla (R13), calidad (R12), estadísticas (R15) y pantalla completa (R26). */
export function MoreSheet({
  pcState,
  sender,
  statsOn,
  onStats,
}: {
  pcState: PcState | null;
  sender: InputSender;
  statsOn: boolean;
  onStats: (on: boolean) => void;
}) {
  const fullscreenAvailable = typeof document.documentElement.requestFullscreen === 'function';
  return (
    <div className="space-y-4">
      {pcState && pcState.displays.length > 1 && (
        <fieldset>
          <legend className="mb-2 font-medium">Pantalla</legend>
          <div className="flex flex-wrap gap-2">
            {pcState.displays.map((d, i) => (
              <button
                key={d.id}
                type="button"
                className={btn}
                aria-pressed={pcState.activeDisplayId === d.id}
                onClick={() => sender.selectDisplay(d.id)}
              >
                {d.label || `Pantalla ${i + 1}`} · {d.width}×{d.height}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <fieldset>
        <legend className="mb-2 font-medium">Calidad</legend>
        <div className="flex flex-wrap gap-2">
          {QUALITY_PRESET_NAMES.map((p) => (
            <button key={p} type="button" className={btn} aria-pressed={pcState?.preset === p} onClick={() => sender.setQuality(p)}>
              {PRESET_LABEL[p]}
            </button>
          ))}
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn} aria-pressed={statsOn} onClick={() => onStats(!statsOn)}>
          Estadísticas
        </button>
        {fullscreenAvailable ? (
          <button
            type="button"
            className={btn}
            onClick={() => {
              if (document.fullscreenElement) void document.exitFullscreen();
              else {
                void document.documentElement.requestFullscreen({ navigationUI: 'hide' }).then(() => {
                  // Horizontal recomendado; algunos navegadores no lo permiten.
                  // `lock` no existe en todos los navegadores aunque lib.dom lo declare.
                  const orientation: { lock?: (o: 'landscape') => Promise<void> } = screen.orientation;
                  void orientation.lock?.call(screen.orientation, 'landscape').catch(() => undefined);
                });
              }
            }}
          >
            Pantalla completa
          </button>
        ) : (
          <p className="text-sm text-liquen">En iPhone: Compartir › Agregar a inicio, y abrila desde ahí para verla a pantalla completa.</p>
        )}
      </div>
    </div>
  );
}
