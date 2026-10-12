import { existsSync, readdirSync, statSync, statfsSync } from 'node:fs';
import { join } from 'node:path';
import { app, BrowserWindow, clipboard, dialog, globalShortcut, screen, type MessageBoxOptions, type Rectangle as Rect } from 'electron';
import { CLIPBOARD_MAX, DOWNLOADS_SUBDIR, SESSION_HOTKEY } from '@shared/constants';
import type { KrTestHooks } from '@shared/testHooks';
import { ElectronScreenSource, electronDisplay } from './adapters/ElectronScreenSource';
import { FakeInjector } from './adapters/FakeInjector';
import { RobotJsInjector } from './adapters/RobotJsInjector';
import { AppController } from './appController';
import type { AskUser } from './auth/approval';
import { createSafeStorageCipher } from './auth/electronCipher';
import { installCaptureHandler } from './capture';
import { FileReceiver, cleanupPartials } from './files/fileReceiver';
import { FileSender } from './files/fileSender';
import { ElectronHostBridge } from './hostBridge';
import { SessionIndicators } from './indicators';
import { registerUiIpc } from './ipc/uiIpc';
import type { InputInjector } from './ports/InputInjector';
import { PhoneLink, type PhoneCommand } from './session/phoneLink';
import { SettingsStore } from './settings';
import { resolveTestMode } from './testMode';
import { configurePermissions, createMainWindow, hardenWebContents, loadPage, securePreferences } from './windows';

const testMode = resolveTestMode(process.env, app.isPackaged);
if (testMode.userDataDir) app.setPath('userData', testMode.userDataDir);

// Se decide antes de `ready`: Chromium lee los switches al arrancar.
const hardwareEncoding = testMode.hardwareEncoding ?? new SettingsStore(join(app.getPath('userData'), 'settings.json')).get().hardwareEncoding;
if (!hardwareEncoding) app.commandLine.appendSwitch('disable-accelerated-video-encode');

const startHidden = process.argv.includes('--hidden');
const screens = new ElectronScreenSource();
let mainWindow: BrowserWindow | null = null;
let indicators: SessionIndicators | null = null;
let controller: AppController | null = null;
let host: ElectronHostBridge | null = null;
let link: PhoneLink | null = null;
let injector: InputInjector | null = null;
let receiver: FileReceiver | null = null;
let sender: FileSender | null = null;
let quitting = false;
let sessionIp: string | null = null;

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

const askUser: AskUser = async ({ deviceName, ip, method }, signal) => {
  showMainWindow();
  const options: MessageBoxOptions = {
    type: 'question',
    buttons: ['Rechazar', 'Permitir'],
    defaultId: 0,
    cancelId: 0,
    noLink: true,
    title: 'Kilorito Remote',
    message: `¿Permitir que ${deviceName} controle esta PC?`,
    detail: `Pedido con ${method === 'qr' ? 'el código QR' : 'el PIN'} desde ${ip}. Si no lo pediste vos, rechazalo. Va a ver la pantalla y usar el mouse y el teclado. Podés cortar en cualquier momento con Ctrl+Alt+Shift+K.`,
    signal,
  };
  const { response } = mainWindow ? await dialog.showMessageBox(mainWindow, options) : await dialog.showMessageBox(options);
  return response === 1;
};

function activeRect() {
  const id = host?.activeDisplayId;
  const display = screens.listDisplays().find((d) => d.id === id) ?? screens.listDisplays()[0];
  return display?.physical ?? { x: 0, y: 0, width: 1, height: 1 };
}

function sendStateToPhone(): void {
  if (!host || !controller) return;
  const s = controller.settings.get();
  host.sendControl({
    t: 'state',
    displays: screens.listDisplays().map(({ physical: _physical, ...info }) => info),
    activeDisplayId: host.activeDisplayId,
    preset: s.preset,
    audio: s.audio,
  });
}

/** Comandos del celular que no son input. */
function onPhoneCommand(cmd: PhoneCommand): void {
  if (!controller || !host) return;
  switch (cmd.t) {
    case 'quality.set':
      controller.setPreset(cmd.preset);
      break;
    case 'display.select': {
      if (host.setDisplay(cmd.displayId)) {
        const display = electronDisplay(cmd.displayId);
        if (display) indicators?.displayChanged(display);
      }
      sendStateToPhone();
      break;
    }
    case 'session.end':
      controller.endSession('USER');
      break;
    case 'clipboard.push':
      void clipboard.writeText(cmd.text);
      break;
    case 'clipboard.pull': {
      const h = host;
      void clipboard.readText().then((text) => h.sendControl({ t: 'clipboard.data', text: text.slice(0, CLIPBOARD_MAX) }));
      break;
    }
  }
}

async function boot(): Promise<void> {
  app.setAppUserModelId('com.kilorito.remote');
  injector = testMode.fakeInjector ? new FakeInjector() : new RobotJsInjector();
  const inj = injector;

  host = new ElectronHostBridge({
    screens,
    settings: () => controller?.settings.get() ?? { preset: 'sharp', audio: true },
    toPeer: (msg) => controller?.session.sendToPeer(msg),
    onPeerState: (state) => {
      if (state === 'failed' || state === 'closed') controller?.session.hostDisconnected();
    },
    onInput: (msg) => link?.handle(msg),
    // Los mensajes del canal `file` son de la transferencia entrante o de la saliente (cada una mira su id).
    onFileMessage: (msg) => {
      receiver?.message(msg);
      sender?.message(msg);
    },
    onFileChunk: (data) => receiver?.chunk(data),
    onChannel: (label, open) => {
      link?.channelChanged(label, open);
      if (label === 'file' && !open) {
        receiver?.reset();
        sender?.reset();
      }
      if (label === 'control' && open) sendStateToPhone();
    },
    onHostGone: () => {
      link?.hostGone();
      controller?.endSession('ERROR');
    },
    onStall: () => {
      console.error('[kr] el host no generó la oferta a tiempo (encoder colgado)');
      link?.hostGone();
      // Con el encoder por hardware colgado, se reinicia con encoding por software; el celular reconecta solo.
      if (hardwareEncoding && !testMode.enabled && controller) {
        controller.settings.update({ hardwareEncoding: false });
        app.relaunch();
        app.exit(0);
        return;
      }
      controller?.endSession('ERROR');
    },
  });
  const hostRef = host;
  link = new PhoneLink({
    injector: inj,
    displayRect: activeRect,
    sendFast: (msg) => hostRef.sendFast(msg),
    sendControl: (msg) => hostRef.sendControl(msg),
    onCommand: onPhoneCommand,
  });
  const linkRef = link;
  const downloads = () => (testMode.enabled ? join(app.getPath('userData'), 'downloads') : join(app.getPath('downloads'), DOWNLOADS_SUBDIR));
  cleanupPartials(downloads());
  receiver = new FileReceiver({
    dir: downloads,
    send: (m) => hostRef.sendFileMessage(m),
    onProgress: (t) => controller?.updateTransfer(t),
    freeBytes: (dir) => {
      const st = statfsSync(dir);
      return st.bavail * st.bsize;
    },
  });
  sender = new FileSender({
    send: (m) => hostRef.sendFileMessage(m),
    sendChunk: (d) => hostRef.sendFileChunk(d),
    onProgress: (t) => controller?.updateTransfer(t),
  });
  const receiverRef = receiver;
  const senderRef = sender;

  configurePermissions((wc) => hostRef.isHostContents(wc));
  installCaptureHandler(
    (wc) => hostRef.isHostContents(wc),
    () => ({ displayId: hostRef.activeDisplayId, audio: hostRef.audioEnabled }),
  );
  screens.onDisplaysChanged(() => {
    inj.displaysChanged();
    sendStateToPhone();
  });

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
    host,
    events: {
      onState: (state) => {
        if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('ui:state', state);
      },
      onStatus: (status) => {
        if (status.status === 'active') {
          if (!indicators?.isLive) {
            linkRef.sessionStarted();
            indicators?.sessionStarted(status.deviceName, electronDisplay(hostRef.activeDisplayId));
          } else if (sessionIp && sessionIp !== status.ip) {
            // El mismo dispositivo reapareció desde otra IP: puede ser un cambio de red o alguien con sus credenciales.
            indicators.notify(`${status.deviceName} se reconectó desde ${status.ip}. Si no fuiste vos, cortá con Ctrl+Alt+Shift+K y revocalo.`);
          }
          sessionIp = status.ip;
        } else {
          // Primero soltar el input; después apagar indicadores.
          sessionIp = null;
          void linkRef.sessionEnded();
          receiverRef.reset();
          senderRef.reset();
          indicators?.sessionEnded();
        }
      },
      onEnded: () => undefined,
      onSettings: (settings) => {
        hostRef.setPreset(settings.preset);
        hostRef.setAudio(settings.audio);
        sendStateToPhone();
      },
    },
    setLoginItem: (on) => app.setLoginItemSettings({ openAtLogin: on, args: ['--hidden'] }),
  });

  const controllerRef = controller;
  registerUiIpc(() => mainWindow, controller, {
    setHardwareEncoding: (on) => {
      controllerRef.settings.update({ hardwareEncoding: on });
      app.relaunch();
      app.exit(0);
    },
    pickAndSendFile: async () => {
      if (controllerRef.session.status.status !== 'active' || !mainWindow) return;
      const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { title: 'Enviar al celular', properties: ['openFile', 'multiSelections'] });
      if (!canceled) filePaths.forEach((p) => senderRef.enqueue(p));
    },
    sendFiles: (paths) => {
      if (controllerRef.session.status.status === 'active') paths.forEach((p) => senderRef.enqueue(p));
      return Promise.resolve();
    },
    cancelTransfer: (id) => {
      senderRef.cancel(id);
      receiverRef.cancel(id);
    },
  });

  // Corte inmediato desde cualquier lugar de Windows.
  if (!globalShortcut.register(SESSION_HOTKEY, () => controller?.endSession('HOTKEY'))) {
    console.warn('No se pudo registrar el atajo', SESSION_HOTKEY);
    controller.hotkeyOk = false;
  }

  mainWindow = buildMainWindow();
  await controller.start();
  // ADR-0008: en producción la constante es false y el bundler elimina los hooks enteros.
  if (__KR_ALLOW_TEST_MODE__) exposeTestHooks();
}

declare global {
  var __krTest: KrTestHooks | undefined;
}

let testpad: BrowserWindow | null = null;

/** Ventana con un textarea donde la suite Android escribe con el injector real (solo test mode). */
async function ensureTestpad(): Promise<BrowserWindow> {
  if (testpad && !testpad.isDestroyed()) return testpad;
  // backgroundThrottling: false para que la animación siga aunque Chromium crea que el overlay la tapa.
  const win = new BrowserWindow({ width: 520, height: 260, show: false, title: 'Kilorito testpad', alwaysOnTop: true, webPreferences: { ...securePreferences(), backgroundThrottling: false } });
  hardenWebContents(win.webContents);
  await loadPage(win, 'testpad');
  testpad = win;
  return win;
}

/** Solo en REMOTE_TEST_MODE: los E2E leen el estado de main con `electronApp.evaluate`. */
function exposeTestHooks(): void {
  if (!testMode.enabled || !controller || !link) return;
  const c = controller;
  const l = link;
  const fake = injector instanceof FakeInjector ? injector : null;
  globalThis.__krTest = {
    state: () => c.state(),
    indicators: () => ({ live: indicators?.isLive ?? false, overlay: indicators?.hasOverlay ?? false }),
    hotkey: () => c.endSession('HOTKEY'),
    token: () => c.tokens.current().token,
    pin: () => c.pins.current().pin,
    revoke: (deviceId) => c.revokeDevice(deviceId),
    setPreset: (preset) => c.setPreset(preset),
    injected: () => [...(fake?.actions ?? [])],
    clearInjected: () => fake?.clear(),
    pressed: () => l.input.pressed,
    cursor: () => injector?.cursorPosition() ?? Promise.resolve({ x: 0, y: 0 }),
    activeRect,
    startActivity: async () => {
      const win = await ensureTestpad();
      win.showInactive();
    },
    focusTestpad: async () => {
      if (!testMode.textareaWindow) return;
      const win = await ensureTestpad();
      win.show();
      win.focus();
      await win.webContents.executeJavaScript('document.querySelector("textarea").focus()');
    },
    testpadTextareaRect: async () => {
      const win = await ensureTestpad();
      const r = (await win.webContents.executeJavaScript(
        '(() => { const b = document.querySelector("textarea").getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height }; })()',
      )) as Rect;
      const content = win.getContentBounds();
      const physical = screen.dipToScreenRect(win, { x: content.x + r.x, y: content.y + r.y, width: r.width, height: r.height });
      const a = activeRect();
      return { x: (physical.x - a.x) / a.width, y: (physical.y - a.y) / a.height, width: physical.width / a.width, height: physical.height / a.height };
    },
    clipboardRead: () => clipboard.readText(),
    clipboardWrite: (text) => clipboard.writeText(text),
    sendFileToPhone: (path) => {
      sender?.enqueue(path);
    },
    receivedFiles: () => {
      const dir = join(app.getPath('userData'), 'downloads');
      if (!existsSync(dir)) return [];
      return readdirSync(dir).map((name) => ({ name, size: statSync(join(dir, name)).size }));
    },
    testpadFocused: () => !!testpad && !testpad.isDestroyed() && testpad.isFocused(),
    testpadText: async () => {
      if (!testpad || testpad.isDestroyed()) return '';
      return String(await testpad.webContents.executeJavaScript('document.querySelector("textarea").value'));
    },
  };
}
