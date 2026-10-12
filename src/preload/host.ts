import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';
import type { HostCommand, KrHostApi, SignalToHost } from '../shared/hostIpc';

// Con sandbox el preload solo tiene `electron`. API mínima: el host nunca ve ipcRenderer.
// Los valores vienen de main (confiable); el host igual los trata como datos, no como código.
function subscribe(channel: string, cb: (value: unknown) => void): () => void {
  const listener = (_event: IpcRendererEvent, value: unknown) => cb(value);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
}

const api: KrHostApi = {
  onCommand: (cb) => subscribe('host:command', (v) => cb(v as HostCommand)),
  onSignal: (cb) => subscribe('host:signal', (v) => cb(v as SignalToHost)),
  sendSignal: (msg) => ipcRenderer.send('host:signal', msg),
  event: (evt) => ipcRenderer.send('host:event', evt),
  input: (msg) => ipcRenderer.send('host:input', msg),
  fileIn: (evt) => ipcRenderer.send('host:file', evt),
  ready: () => ipcRenderer.send('host:ready'),
};

contextBridge.exposeInMainWorld('krHost', api);
