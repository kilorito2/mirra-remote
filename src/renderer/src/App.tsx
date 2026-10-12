import { useState } from 'react';
import { QUALITY_PRESET_NAMES } from '@shared/constants';
import type { KrUiApi } from '@shared/uiState';
import { PRESET_HINT, PRESET_LABEL } from './format';
import { useNow, useUiState } from './hooks';
import { DeviceList } from './components/DeviceList';
import { Transfers } from './components/Transfers';
import { PairingPanel } from './components/PairingPanel';
import { FirstRunNotice, SessionHeader } from './components/SessionHeader';
import { Section, Segmented, Toggle } from './components/controls';

const presetOptions = QUALITY_PRESET_NAMES.map((value) => ({ value, label: PRESET_LABEL[value], hint: PRESET_HINT[value] }));

export function App({ api }: { api: KrUiApi }) {
  const state = useUiState(api);
  const now = useNow();
  const [showCa, setShowCa] = useState(false);

  if (!state) return <p className="p-6 text-liquen">Iniciando…</p>;
  const active = state.session.status === 'active';

  return (
    <main className="mx-auto max-w-md">
      <SessionHeader session={state.session} now={now} onEnd={() => void api.endSession()} />
      {state.firstRun && <FirstRunNotice onDismiss={() => void api.dismissFirstRun()} />}
      {!state.hotkeyOk && (
        <p role="alert" className="mx-6 mb-4 rounded-xl border border-alerta p-3 text-sm">
          Otro programa ya usa Ctrl+Alt+Shift+K, así que el corte rápido no funciona. Para cortar usá el botón o el menú de la bandeja.
        </p>
      )}

      {!active && (
        <PairingPanel
          server={state.server}
          pairing={state.pairing}
          now={now}
          onSelectIp={(ip) => void api.selectIp(ip)}
          onRegenerate={() => void api.regeneratePairing()}
        />
      )}

      <Section title="Transmisión">
        <Segmented label="Calidad" value={state.settings.preset} options={presetOptions} onChange={(p) => void api.setPreset(p)} />
        <Toggle label="Audio de la PC" hint="El celular arranca en silencio" checked={state.settings.audio} onChange={(on) => void api.setAudio(on)} />
      </Section>

      <Section title="Archivos">
        <Transfers
          active={active}
          transfers={state.transfers}
          onPick={() => void api.pickAndSendFile()}
          onDrop={(files) => void api.sendFiles(files)}
          onCancel={(id) => void api.cancelTransfer(id)}
        />
      </Section>

      <Section title="Dispositivos emparejados">
        <DeviceList devices={state.devices} session={state.session} now={now} onRevoke={(id) => void api.revokeDevice(id)} />
      </Section>

      <Section title="Esta PC">
        <Toggle label="Iniciar con Windows" hint="Queda en la bandeja, sin abrir la ventana" checked={state.settings.startWithWindows} onChange={(on) => void api.setStartWithWindows(on)} />
        <Toggle
          label="Codificación por hardware"
          hint="Más fluida. Si la imagen no llega, se desactiva sola. Cambiarla reinicia la app."
          checked={state.settings.hardwareEncoding}
          onChange={(on) => void api.setHardwareEncoding(on)}
        />
        <div>
          <button
            type="button"
            className="min-h-11 text-left underline decoration-rama underline-offset-4 hover:decoration-pico"
            aria-expanded={showCa}
            onClick={() => setShowCa((v) => !v)}
          >
            Sacar la advertencia de seguridad del celular
          </button>
          {showCa && (
            <div className="mt-2 space-y-2 text-sm text-liquen">
              <p>
                Desde el celular abrí <span className="text-pluma tabular-nums">https://{state.server.selectedIp}:{state.server.port}/ca.crt</span> e
                instalá el certificado.
              </p>
              <p>iPhone: Ajustes, General, VPN y gestión de dispositivos, instalar; después Información, Confianza de certificados, activarlo.</p>
              <p>Android: Ajustes, Seguridad, Más ajustes, Instalar certificados, Certificado de CA.</p>
              <p className="break-all">
                Antes de confiar en el certificado, compará su huella SHA-256 con esta (el celular la muestra al instalarlo). Si no coincide, no lo
                instales: alguien en la red está interceptando. {state.caFingerprint}
              </p>
            </div>
          )}
        </div>
      </Section>
    </main>
  );
}
