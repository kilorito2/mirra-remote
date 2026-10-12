import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { App } from './App';
import type { Phase, SignalingClient, SignalingOptions } from './net/signaling';

function fakeClient() {
  let opts: SignalingOptions | null = null;
  const client = {
    connect: vi.fn(),
    stop: vi.fn(),
    end: vi.fn(),
    retryNow: vi.fn(),
    pairWithPin: vi.fn(),
    setDeviceName: vi.fn(),
  };
  const factory = (o: SignalingOptions) => {
    opts = o;
    return client as unknown as SignalingClient;
  };
  const emit = (phase: Phase) => act(() => opts?.onPhase(phase));
  return { client, factory, emit };
}

describe('App (celular)', () => {
  it('pide el PIN y lo manda con el nombre elegido', async () => {
    const { client, factory, emit } = fakeClient();
    render(<App token={null} createClient={factory} />);
    emit({ kind: 'needPairing', reason: null });
    const user = userEvent.setup();
    const connect = screen.getByRole('button', { name: 'Conectar' });
    expect(connect).toBeDisabled();
    await user.type(screen.getByLabelText('PIN'), '12a3456');
    const name = screen.getByLabelText('Nombre de este celular');
    await user.clear(name);
    await user.type(name, 'Mi Pixel');
    await user.click(connect);
    expect(client.setDeviceName).toHaveBeenCalledWith('Mi Pixel');
    expect(client.pairWithPin).toHaveBeenCalledWith('123456');
  });

  it('explica el bloqueo de PIN', () => {
    const { factory, emit } = fakeClient();
    render(<App token={null} createClient={factory} />);
    emit({ kind: 'needPairing', reason: { code: 'PIN_LOCKED', retryAfterMs: 240_000 } });
    expect(screen.getByRole('alert')).toHaveTextContent('Esperá 4 min');
    expect(screen.getByRole('button', { name: 'Conectar' })).toBeDisabled();
  });

  it('muestra la espera de aprobación y el estado ocupado', async () => {
    const { client, factory, emit } = fakeClient();
    render(<App token={'T'.repeat(43)} createClient={factory} />);
    emit({ kind: 'pendingApproval' });
    expect(screen.getByRole('heading', { name: 'Aceptá la conexión en la PC' })).toBeInTheDocument();
    emit({ kind: 'busy' });
    await userEvent.setup().click(screen.getByRole('button', { name: 'Probar de nuevo' }));
    expect(client.retryNow).toHaveBeenCalled();
  });

  it('explica por qué terminó la sesión', () => {
    const { factory, emit } = fakeClient();
    render(<App token={null} createClient={factory} />);
    emit({ kind: 'ended', reason: 'REVOKED' });
    expect(screen.getByText('La PC quitó el permiso a este celular.')).toBeInTheDocument();
  });
});
