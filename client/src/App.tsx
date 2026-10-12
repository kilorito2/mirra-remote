import { useState } from 'react';
import type { SessionEndReason } from '@shared/protocol';
import { guessDeviceName } from './net/credentials';
import { PinForm } from './screens/PinForm';
import { SessionScreen } from './screens/SessionScreen';
import { StatusScreen } from './screens/StatusScreen';
import { defaultFactory, useRemote, type ClientFactory } from './useRemote';

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

export function App({ token, createClient = defaultFactory }: { token: string | null; createClient?: ClientFactory }) {
  const [name, setName] = useState(storedName);
  const remote = useRemote(token, name, createClient);
  const { phase, client, stream, peerState } = remote;

  // Mientras WebRTC siga vivo, un corte del WS no saca al usuario de la pantalla remota.
  const transient = phase.kind === 'offline' || phase.kind === 'connecting' || phase.kind === 'authenticating';
  const peerAlive = peerState === 'connected' || peerState === 'disconnected' || peerState === 'connecting';
  if (phase.kind === 'ready' || (transient && peerAlive && stream)) {
    return (
      <SessionScreen stream={stream} reconnecting={transient || peerState === 'disconnected'}>
        <button
          type="button"
          onClick={() => client.end()}
          className="absolute top-3 right-3 min-h-11 rounded-pill bg-selva/80 px-4 font-semibold text-pluma backdrop-blur"
        >
          Salir
        </button>
      </SessionScreen>
    );
  }

  return <main className="flex h-full items-center justify-center px-6 py-8">{render()}</main>;

  function render() {
    switch (phase.kind) {
      case 'connecting':
      case 'authenticating':
      case 'ready':
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
