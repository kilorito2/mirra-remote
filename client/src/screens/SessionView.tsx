import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyName } from '@shared/protocol';
import type { Mode } from '../input/gestures';
import { InputSender } from '../input/InputSender';
import type { Remote } from '../useRemote';
import { KeyboardInput, type KeyboardHandle } from './KeyboardInput';
import { ClipboardSheet, FilesSheet, MoreSheet, StatsOverlay, useWakeLock } from './extras';
import { KeysSheet } from './KeysSheet';
import { RemoteSurface } from './RemoteSurface';
import { Sheet, Toolbar, type ToolbarItem } from './Toolbar';

const HIDE_AFTER_MS = 4_000;
const MODE_KEY = 'kr.mode';

type Modifier = Extract<KeyName, 'ctrl' | 'alt' | 'shift' | 'meta'>;

function storedMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'direct' ? 'direct' : 'trackpad';
  } catch {
    return 'trackpad';
  }
}

/** Sesión activa: video + gestos, barra flotante, teclado y teclas especiales. */
export function SessionView({ remote, reconnecting }: { remote: Remote; reconnecting: boolean }) {
  const { peer, client, stream, onCursor, files, transfers, pcClipboard, pcState } = remote;
  const [sender] = useState(() => new InputSender(peer));
  const [mode, setMode] = useState<Mode>(storedMode);
  const [sheet, setSheet] = useState<'keys' | 'more' | 'clipboard' | 'files' | null>(null);
  const [audioOn, setAudioOn] = useState(false);
  const [statsOn, setStatsOn] = useState(false);
  const video = useRef<HTMLVideoElement | null>(null);
  const onVideo = useCallback((el: HTMLVideoElement | null) => {
    video.current = el;
  }, []);
  const getPc = useCallback(() => peer.connection, [peer]);
  useWakeLock();
  const [toolbarHidden, setToolbarHidden] = useState(false);
  const [modifiers, setModifiers] = useState<Modifier[]>([]);
  const keyboard = useRef<KeyboardHandle>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Heartbeat mientras dure la sesión; al irse a segundo plano la PC suelta todo.
  useEffect(() => {
    sender.start();
    const onHidden = () => {
      if (document.visibilityState === 'hidden') sender.reset();
    };
    document.addEventListener('visibilitychange', onHidden);
    window.addEventListener('pagehide', onHidden);
    return () => {
      document.removeEventListener('visibilitychange', onHidden);
      window.removeEventListener('pagehide', onHidden);
      sender.reset();
      sender.stop();
    };
  }, [sender]);

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setToolbarHidden(true), HIDE_AFTER_MS);
  }, []);

  useEffect(() => {
    scheduleHide();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [scheduleHide]);

  const reveal = () => {
    setToolbarHidden(false);
    scheduleHide();
  };

  const items: ToolbarItem[] = [
    {
      id: 'keyboard',
      label: 'Teclado',
      icon: 'keyboard',
      onClick: () => {
        keyboard.current?.open();
        scheduleHide();
      },
    },
    {
      id: 'mode',
      label: mode === 'trackpad' ? 'Modo trackpad (tocá para cambiar a táctil directo)' : 'Modo táctil directo (tocá para cambiar a trackpad)',
      icon: mode === 'trackpad' ? 'trackpad' : 'touch',
      onClick: () => {
        const next: Mode = mode === 'trackpad' ? 'direct' : 'trackpad';
        setMode(next);
        try {
          localStorage.setItem(MODE_KEY, next);
        } catch {
          // Preferencia solo para esta sesión.
        }
        scheduleHide();
      },
    },
    { id: 'keys', label: 'Teclas especiales', icon: 'keys', pressed: sheet === 'keys', onClick: () => setSheet(sheet === 'keys' ? null : 'keys') },
    {
      id: 'audio',
      label: audioOn ? 'Silenciar el audio de la PC' : 'Activar el audio de la PC',
      icon: audioOn ? 'sound' : 'mute',
      pressed: audioOn,
      onClick: () => {
        // R22: arranca muteado por la política de autoplay; se activa acá, dentro del toque.
        const el = video.current;
        if (!el) return;
        el.muted = audioOn;
        if (!audioOn) void el.play().catch(() => undefined);
        setAudioOn(!audioOn);
      },
    },
    { id: 'more', label: 'Más opciones', icon: 'more', pressed: sheet !== null && sheet !== 'keys', onClick: () => setSheet(sheet === 'more' ? null : 'more') },
    { id: 'exit', label: 'Salir', icon: 'exit', onClick: () => client.end() },
  ];

  return (
    <>
      <RemoteSurface stream={stream} mode={mode} sender={sender} onCursor={onCursor} onActivity={() => setSheet(null)} onVideo={onVideo} />
      {statsOn && <StatsOverlay pc={getPc} />}
      <KeyboardInput ref={keyboard} sender={sender} modifiers={modifiers} onModifiersUsed={() => setModifiers([])} />
      {reconnecting && (
        <p role="status" className="fixed top-3 left-1/2 z-20 -translate-x-1/2 rounded-pill bg-selva/90 px-4 py-2 text-sm">
          Reconectando…
        </p>
      )}
      {modifiers.length > 0 && (
        <p role="status" className="fixed top-3 left-3 z-20 rounded-pill bg-pico px-3 py-1.5 text-sm font-semibold text-selva">
          {modifiers.map((m) => ({ ctrl: 'Ctrl', alt: 'Alt', shift: 'Shift', meta: 'Win' })[m]).join(' + ')} +
        </p>
      )}
      {sheet === 'more' && (
        <Sheet title="Más opciones" onClose={() => setSheet(null)}>
          <div className="mb-4 flex flex-wrap gap-2">
            <button type="button" className="min-h-11 rounded-lg bg-hoja px-4 font-semibold" onClick={() => setSheet('clipboard')}>
              Portapapeles
            </button>
            <button type="button" className="min-h-11 rounded-lg bg-hoja px-4 font-semibold" onClick={() => setSheet('files')}>
              Archivos
            </button>
          </div>
          <MoreSheet pcState={pcState} sender={sender} statsOn={statsOn} onStats={setStatsOn} />
        </Sheet>
      )}
      {sheet === 'clipboard' && (
        <Sheet title="Portapapeles" onClose={() => setSheet(null)}>
          <ClipboardSheet sender={sender} pcClipboard={pcClipboard} />
        </Sheet>
      )}
      {sheet === 'files' && (
        <Sheet title="Archivos" onClose={() => setSheet(null)}>
          <FilesSheet files={files} transfers={transfers} />
        </Sheet>
      )}
      {sheet === 'keys' && (
        <Sheet title="Teclas especiales" onClose={() => setSheet(null)}>
          <KeysSheet sender={sender} modifiers={modifiers} onModifiers={setModifiers} />
        </Sheet>
      )}
      <Toolbar items={items} hidden={toolbarHidden && sheet === null} onReveal={reveal} />
    </>
  );
}
