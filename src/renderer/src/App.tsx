import { useState } from 'react';
import { QUALITY_PRESET_NAMES } from '@shared/constants';
import type { KrUiApi } from '@shared/uiState';
import { PRESET_HINT, PRESET_LABEL } from './format';
import { useNow, useUiState } from './hooks';
import { DeviceList } from './components/DeviceList';
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

      <Section title="Dispositivos emparejados">
        <DeviceList devices={state.devices} session={state.session} now={now} onRevoke={(id) => void api.revokeDevice(id)} />
      </Section>

      <Section title="Esta PC">
        <Toggle label="Iniciar con Windows" hint="Queda en la bandeja, sin abrir la ventana" checked={state.settings.startWithWindows} onChange={(on) => void api.setStartWithWindows(on)} />
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
              <p className="break-all">Huella para comparar: {state.caFingerprint}</p>
            </div>
          )}
        </div>
      </Section>
    </main>
  );
}
