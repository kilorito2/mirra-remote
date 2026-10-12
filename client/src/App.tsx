import { useEffect, useState } from 'react';
import type { SessionEndReason } from '@shared/protocol';
import { guessDeviceName } from './net/credentials';
import { SignalingClient, type Phase, type SignalingOptions } from './net/signaling';
import { PinForm } from './screens/PinForm';
import { StatusScreen } from './screens/StatusScreen';

const NAME_KEY = 'kr.deviceName';

const ENDED_TEXT: Record<SessionEndReason, string> = {
  USER: 'Cortaste la sesión.',
  HOTKEY: 'Alguien cortó la sesión desde la PC.',
  REVOKED: 'La PC quitó el permiso a este celular.',
  REPLACED: 'Este celular se conectó desde otra pestaña.',
  TIMEOUT: 'Se perdió la conexión con la PC.',
  ERROR: 'La sesión se cortó por un error en la PC.',
};

function storedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? guessDeviceName();
  } catch {
    return guessDeviceName();
  }
}

type ClientFactory = (opts: SignalingOptions) => SignalingClient;
const defaultFactory: ClientFactory = (opts) => new SignalingClient(opts);

export function App({ token, createClient = defaultFactory }: { token: string | null; createClient?: ClientFactory }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'connecting' });
  const [name, setName] = useState(storedName);
  const [client] = useState(() => createClient({ token, deviceName: name, onPhase: setPhase }));

  useEffect(() => {
    client.connect();
    return () => client.stop();
  }, [client]);

  return <main className="flex h-full items-center justify-center px-6 py-8">{render()}</main>;

  function render() {
    switch (phase.kind) {
      case 'connecting':
      case 'authenticating':
        return <StatusScreen title="Buscando tu PC" busy />;
      case 'needPairing':
        return (
          <PinForm
            reason={phase.reason}
            defaultName={name}
            onSubmit={(pin, newName) => {
              client.setDeviceName(newName);
              setName(newName);
              try {
                localStorage.setItem(NAME_KEY, newName);
              } catch {
                // Sin almacenamiento (modo privado): el nombre vale solo para esta vez.
              }
              client.pairWithPin(pin);
            }}
          />
        );
      case 'pendingApproval':
        return (
          <StatusScreen title="Aceptá la conexión en la PC" busy>
            Kilorito Remote preguntó si {name} puede controlar la PC.
          </StatusScreen>
        );
      case 'ready':
        return (
          <StatusScreen title={`Conectado a ${phase.hostName}`} action={{ label: 'Cortar', onClick: () => client.end() }}>
            La imagen de la pantalla llega en un instante.
          </StatusScreen>
        );
      case 'busy':
        return (
          <StatusScreen title="La PC está ocupada" action={{ label: 'Probar de nuevo', onClick: () => client.retryNow() }}>
            Otro dispositivo la está controlando. Solo puede haber uno a la vez.
          </StatusScreen>
        );
      case 'ended':
        return (
          <StatusScreen title="Sesión terminada" action={{ label: 'Volver a conectar', onClick: () => client.retryNow() }}>
            {ENDED_TEXT[phase.reason]}
          </StatusScreen>
        );
      case 'offline':
        return (
          <StatusScreen title="Sin conexión con la PC" busy>
            Revisá que el celular siga en la misma red. Reintento en {Math.ceil(phase.retryInMs / 1000)} s.
          </StatusScreen>
        );
    }
  }
}
