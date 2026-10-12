import { contextBridge, ipcRenderer, webUtils, type IpcRendererEvent } from 'electron';
import type { KrUiApi, UiState } from '../shared/uiState';

// Con sandbox el preload solo tiene `electron`. Se expone una API mínima y tipada, nunca ipcRenderer.
const api: KrUiApi = {
  getState: () => ipcRenderer.invoke('ui:getState') as Promise<UiState>,
  onState: (cb) => {
    const listener = (_event: IpcRendererEvent, state: UiState) => cb(state);
    ipcRenderer.on('ui:state', listener);
    return () => ipcRenderer.removeListener('ui:state', listener);
  },
  selectIp: (ip) => ipcRenderer.invoke('ui:selectIp', ip) as Promise<void>,
  setPreset: (preset) => ipcRenderer.invoke('ui:setPreset', preset) as Promise<void>,
  setAudio: (on) => ipcRenderer.invoke('ui:setAudio', on) as Promise<void>,
  revokeDevice: (id) => ipcRenderer.invoke('ui:revokeDevice', id) as Promise<void>,
  endSession: () => ipcRenderer.invoke('ui:endSession') as Promise<void>,
  setStartWithWindows: (on) => ipcRenderer.invoke('ui:setStartWithWindows', on) as Promise<void>,
  dismissFirstRun: () => ipcRenderer.invoke('ui:dismissFirstRun') as Promise<void>,
  setHardwareEncoding: (on) => ipcRenderer.invoke('ui:setHardwareEncoding', on) as Promise<void>,
  regeneratePairing: () => ipcRenderer.invoke('ui:regeneratePairing') as Promise<void>,
  pickAndSendFile: () => ipcRenderer.invoke('ui:pickAndSendFile') as Promise<void>,
  sendFiles: (files) => ipcRenderer.invoke('ui:sendFiles', files.map((f) => webUtils.getPathForFile(f))) as Promise<void>,
  cancelTransfer: (id) => ipcRenderer.invoke('ui:cancelTransfer', id) as Promise<void>,
};

contextBridge.exposeInMainWorld('kr', api);
