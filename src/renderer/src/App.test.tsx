import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { KrUiApi, UiState } from '@shared/uiState';
import { App } from './App';

function baseState(): UiState {
  return {
    server: { port: 47800, ips: [{ address: '192.168.0.33', iface: 'Wi-Fi', kind: 'wifi' }], selectedIp: '192.168.0.33', running: true, error: null },
    pairing: { url: 'https://192.168.0.33:47800/#t=x', qrDataUrl: 'data:image/png;base64,AA==', tokenExpiresAt: Date.now() + 90_000, pin: '482913', pinExpiresAt: Date.now() + 90_000 },
    session: { status: 'idle' },
    devices: [{ id: 'd'.repeat(22), name: 'Pixel 8', createdAt: 0, lastSeenAt: Date.now() - 120_000 }],
    settings: { preset: 'sharp', audio: true, startWithWindows: false },
    transfers: [],
    firstRun: false,
    caFingerprint: 'AA:BB',
  };
}

function fakeApi(state: UiState) {
  let listener: ((s: UiState) => void) | null = null;
  const api = {
    getState: vi.fn(() => Promise.resolve(state)),
    onState: vi.fn((cb: (s: UiState) => void) => {
      listener = cb;
      return () => undefined;
    }),
    selectIp: vi.fn(() => Promise.resolve()),
    setPreset: vi.fn(() => Promise.resolve()),
    setAudio: vi.fn(() => Promise.resolve()),
    revokeDevice: vi.fn(() => Promise.resolve()),
    endSession: vi.fn(() => Promise.resolve()),
    setStartWithWindows: vi.fn(() => Promise.resolve()),
    dismissFirstRun: vi.fn(() => Promise.resolve()),
    regeneratePairing: vi.fn(() => Promise.resolve()),
    pickAndSendFile: vi.fn(() => Promise.resolve()),
    sendFiles: vi.fn(() => Promise.resolve()),
    cancelTransfer: vi.fn(() => Promise.resolve()),
  } satisfies KrUiApi;
  return { api, push: (s: UiState) => act(() => listener?.(s)) };
}

describe('App (PC)', () => {
  it('muestra QR, PIN agrupado y la red elegida', async () => {
    const { api } = fakeApi(baseState());
    render(<App api={api} />);
    expect(await screen.findByAltText('Código QR para conectar el celular')).toBeInTheDocument();
    expect(screen.getByTestId('pin')).toHaveTextContent('482 913');
    expect(screen.getByRole('combobox')).toHaveDisplayValue('Wi-Fi: 192.168.0.33:47800');
  });

  it('cambia el preset y revoca dispositivos', async () => {
    const { api } = fakeApi(baseState());
    render(<App api={api} />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole('radio', { name: /Fluido/ }));
    expect(api.setPreset).toHaveBeenCalledWith('smooth');
    await user.click(screen.getByRole('button', { name: 'Revocar Pixel 8' }));
    expect(api.revokeDevice).toHaveBeenCalledWith('d'.repeat(22));
  });

  it('con sesión activa esconde el QR y permite cortar', async () => {
    const { api, push } = fakeApi(baseState());
    render(<App api={api} />);
    await screen.findByTestId('pin');
    push({ ...baseState(), session: { status: 'active', deviceId: 'd'.repeat(22), deviceName: 'Pixel 8', ip: '192.168.0.50', since: Date.now() } });
    const header = screen.getByRole('status');
    expect(within(header).getByText('Pixel 8 está controlando esta PC')).toBeInTheDocument();
    expect(screen.queryByTestId('pin')).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Cortar sesión' }));
    expect(api.endSession).toHaveBeenCalled();
  });

  it('error del servidor con instrucciones', async () => {
    const state = baseState();
    state.server.error = 'El puerto 47800 está ocupado por otra aplicación.';
    const { api } = fakeApi(state);
    render(<App api={api} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('El puerto 47800 está ocupado');
  });

  it('aviso de firewall en el primer arranque', async () => {
    const { api } = fakeApi({ ...baseState(), firstRun: true });
    render(<App api={api} />);
    await userEvent.setup().click(await screen.findByRole('button', { name: 'Entendido' }));
    expect(api.dismissFirstRun).toHaveBeenCalled();
  });
});
