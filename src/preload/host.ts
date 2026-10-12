import { contextBridge } from 'electron';

// Fase 2: puente del renderer host (signaling, input, archivos).
contextBridge.exposeInMainWorld('krHost', {});
