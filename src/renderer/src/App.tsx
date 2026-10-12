import { useState } from 'react';
import { QUALITY_PRESET_NAMES } from '@shared/constants';
import type { KrUiApi } from '@shared/uiState';
import { PRESET_HINT, PRESET_LABEL } from './format';
import { useNow, useUiState } from './hooks';
import { DeviceList } from './components/DeviceList';
import { Transfers } from './components/Transfers';
import { PairingPanel } from './components/PairingPanel';
import { FirstRunNotice, SessionHeader } from './components/SessionHeader';
import { Button, Icon, Section, Segmented, Toggle } from './components/controls';

const presetOptions = QUALITY_PRESET_NAMES.map((value) => ({ value, label: PRESET_LABEL[value], hint: PRESET_HINT[value] }));

export function App({ api }: { api: KrUiApi }) {
  const state = useUiState(api);
  const now = useNow();
  const [showCa, setShowCa] = useState(false);

  if (!state) return <p className="p-6 text-liquen">Iniciando…</p>;
  const active = state.session.status === 'active';

  return (
    <main className="mx-auto max-w-md space-y-[22px] px-5 pt-5 pb-7">
      <SessionHeader session={state.session} now={now} onEnd={() => void api.endSession()} />
      {state.firstRun && <FirstRunNotice onDismiss={() => void api.dismissFirstRun()} />}
      {!state.hotkeyOk && (
        <p role="alert" className="rounded-2xl border border-alerta/40 bg-alerta/8 p-3.5 text-[13px]">
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

      <Section
        title="Archivos"
        card={false}
        aside={
          active && (
            <Button variant="primary" size="sm" onClick={() => void api.pickAndSendFile()}>
              Enviar al celular
            </Button>
          )
        }
      >
        <Transfers
          active={active}
          transfers={state.transfers}
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
            className="flex min-h-12 w-full items-center justify-between gap-3 px-4 text-left font-medium transition-colors hover:bg-tecla/60"
            aria-expanded={showCa}
            onClick={() => setShowCa((v) => !v)}
          >
            Sacar la advertencia de seguridad del celular
            <Icon name="chevronRight" className={`size-4 shrink-0 text-liquen transition-transform ${showCa ? 'rotate-90' : ''}`} />
          </button>
          {showCa && (
            <div className="space-y-2 px-4 pb-4 text-[13px] text-liquen">
              <p>
                Desde el celular abrí{' '}
                <span className="font-mono text-pluma">
                  https://{state.server.selectedIp}:{state.server.port}/ca.crt
                </span>{' '}
                e instalá el certificado.
              </p>
              <p>iPhone: Ajustes, General, VPN y gestión de dispositivos, instalar; después Información, Confianza de certificados, activarlo.</p>
              <p>Android: Ajustes, Seguridad, Más ajustes, Instalar certificados, Certificado de CA.</p>
              <p className="break-all">
                Antes de confiar en el certificado, compará su huella SHA-256 con esta (el celular la muestra al instalarlo). Si no coincide, no lo
                instales: alguien en la red está interceptando. <span className="font-mono text-tenue">{state.caFingerprint}</span>
              </p>
            </div>
          )}
        </div>
      </Section>
    </main>
  );
}
