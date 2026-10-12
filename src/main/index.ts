import { join } from 'node:path';
import { app, dialog, globalShortcut, type BrowserWindow, type MessageBoxOptions } from 'electron';
import { SESSION_HOTKEY } from '@shared/constants';
import type { KrTestHooks } from '@shared/testHooks';
import { AppController } from './appController';
import { createSafeStorageCipher } from './auth/electronCipher';
import type { AskUser } from './auth/approval';
import { SessionIndicators } from './indicators';
import { registerUiIpc } from './ipc/uiIpc';
import type { HostBridge } from './session/sessionManager';
import { resolveTestMode } from './testMode';
import { configurePermissions, createMainWindow, loadPage } from './windows';

const testMode = resolveTestMode(process.env, app.isPackaged);
if (testMode.userDataDir) app.setPath('userData', testMode.userDataDir);

const startHidden = process.argv.includes('--hidden');
let mainWindow: BrowserWindow | null = null;
let indicators: SessionIndicators | null = null;
let controller: AppController | null = null;
let quitting = false;

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showMainWindow());
  app.whenReady().then(boot).catch((err: unknown) => {
    console.error('[kr] arranque falló', err);
    dialog.showErrorBox('Kilorito Remote', `No se pudo iniciar: ${err instanceof Error ? err.message : String(err)}`);
    app.exit(1);
  });
}

// La app vive en el tray: cerrar todas las ventanas no la termina.
app.on('window-all-closed', () => undefined);
app.on('before-quit', () => {
  quitting = true;
});
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

function showMainWindow(): void {
  if (!mainWindow || mainWindow.isDestroyed()) mainWindow = buildMainWindow();
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
}

function buildMainWindow(): BrowserWindow {
  const win = createMainWindow();
  win.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      win.hide();
    }
  });
  win.once('ready-to-show', () => {
    if (!startHidden || testMode.enabled) win.show();
  });
  void loadPage(win, 'index');
  return win;
}

/** Fase 1: todavía no hay WebRTC (llega en la Fase 2). */
const nullHost: HostBridge = {
  start: () => undefined,
  signal: () => undefined,
  stop: () => undefined,
  isPeerConnected: () => false,
};

const askUser: AskUser = async ({ deviceName, ip }, signal) => {
  showMainWindow();
  const options: MessageBoxOptions = {
    type: 'question',
    buttons: ['Rechazar', 'Permitir'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Kilorito Remote',
    message: `¿Permitir que ${deviceName} controle esta PC?`,
    detail: `Conexión desde ${ip}. Va a ver la pantalla y usar el mouse y el teclado. Podés cortar en cualquier momento con Ctrl+Alt+Shift+K.`,
    signal,
  };
  const { response } = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
  return response === 1;
};

async function boot(): Promise<void> {
  app.setAppUserModelId('com.kilorito.remote');
  configurePermissions(() => false);

  indicators = new SessionIndicators({
    open: showMainWindow,
    endSession: () => controller?.endSession('USER'),
    quit: () => {
      quitting = true;
      void controller?.stop().finally(() => app.quit());
    },
  });

  controller = new AppController({
    userData: app.getPath('userData'),
    clientDir: join(app.getAppPath(), 'dist-client'),
    testMode,
    cipher: createSafeStorageCipher(),
    ask: askUser,
    host: nullHost,
    events: {
      onState: (state) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ui:state', state);
      },
      onStatus: (status) => {
        if (status.status === 'active') {
          if (!indicators?.isLive) indicators?.sessionStarted(status.deviceName);
        } else {
          indicators?.sessionEnded();
        }
      },
      onEnded: () => undefined,
      onSettings: () => undefined,
    },
    setLoginItem: (on) => app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] }),
  });

  registerUiIpc(() => mainWindow, controller, {
    pickAndSendFile: () => Promise.resolve(),
    sendFiles: () => Promise.resolve(),
    cancelTransfer: () => undefined,
  });

  // Corte inmediato desde cualquier lugar de Windows.
  if (!globalShortcut.register(SESSION_HOTKEY, () => controller?.endSession('HOTKEY'))) {
    console.warn('No se pudo registrar el atajo', SESSION_HOTKEY);
  }

  mainWindow = buildMainWindow();
  await controller.start();
  exposeTestHooks();
}

declare global {
  var __krTest: KrTestHooks | undefined;
}


/** Solo en REMOTE_TEST_MODE: los E2E leen el estado de main con `electronApp.evaluate`. */
function exposeTestHooks(): void {
  if (!testMode.enabled || !controller) return;
  const c = controller;
  globalThis.__krTest = {
    state: () => c.state(),
    indicators: () => ({ live: indicators?.isLive ?? false, overlay: indicators?.hasOverlay ?? false }),
    hotkey: () => c.endSession('HOTKEY'),
    token: () => c.tokens.current().token,
    pin: () => c.pins.current().pin,
    revoke: (deviceId) => c.revokeDevice(deviceId),
  };
}
