import { ipcMain, type BrowserWindow, type IpcMainInvokeEvent } from 'electron';
import type { z } from 'zod';
import { UiArgs } from '@shared/uiState';
import type { AppController } from '../appController';
import { isPageUrl } from '../windows';

export interface UiIpcExtras {
  setHardwareEncoding(on: boolean): void;
  pickAndSendFile(): Promise<void>;
  sendFiles(paths: string[]): Promise<void>;
  cancelTransfer(id: string): void;
}

/**
 * IPC de la ventana principal. Cada handler verifica que el mensaje venga de esa ventana
 * y de la página esperada, y valida los argumentos con zod.
 */
export function registerUiIpc(getWindow: () => BrowserWindow | null, app: AppController, extras: UiIpcExtras): void {
  const fromUi = (event: IpcMainInvokeEvent): boolean => {
    const win = getWindow();
    return !!win && event.sender.id === win.webContents.id && isPageUrl(event.senderFrame?.url ?? '', 'index');
  };

  const handle = <S extends z.ZodType | null>(
    channel: string,
    schema: S,
    fn: (arg: S extends z.ZodType ? z.infer<S> : undefined) => unknown,
  ) => {
    ipcMain.handle(channel, async (event, raw: unknown) => {
      if (!fromUi(event)) throw new Error('remitente no autorizado');
      if (schema === null) return fn(undefined as S extends z.ZodType ? z.infer<S> : undefined);
      const parsed = schema.safeParse(raw);
      if (!parsed.success) throw new Error('argumento inválido');
      return await fn(parsed.data as S extends z.ZodType ? z.infer<S> : undefined);
    });
  };

  handle('ui:getState', null, () => app.state());
  handle('ui:selectIp', UiArgs.selectIp, (ip) => app.selectIp(ip));
  handle('ui:setPreset', UiArgs.setPreset, (preset) => app.setPreset(preset));
  handle('ui:setAudio', UiArgs.setAudio, (on) => app.setAudio(on));
  handle('ui:revokeDevice', UiArgs.revokeDevice, (id) => app.revokeDevice(id));
  handle('ui:endSession', null, () => app.endSession('USER'));
  handle('ui:setStartWithWindows', UiArgs.setStartWithWindows, (on) => app.setStartWithWindows(on));
  handle('ui:dismissFirstRun', null, () => app.dismissFirstRun());
  handle('ui:setHardwareEncoding', UiArgs.setHardwareEncoding, (on) => extras.setHardwareEncoding(on));
  handle('ui:regeneratePairing', null, () => app.regeneratePairing());
  handle('ui:pickAndSendFile', null, () => extras.pickAndSendFile());
  handle('ui:sendFiles', UiArgs.sendFiles, (paths) => extras.sendFiles(paths));
  handle('ui:cancelTransfer', UiArgs.cancelTransfer, (id) => extras.cancelTransfer(id));
}
