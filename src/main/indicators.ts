import { BrowserWindow, Menu, Notification, Tray, nativeImage, screen, type Display } from 'electron';
import { hardenWebContents, loadPage, resourcePath, securePreferences } from './windows';

export interface TrayActions {
  open(): void;
  endSession(): void;
  quit(): void;
}

/**
 * Indicadores de sesión activa: tray rojo, borde de color en la pantalla capturada (click-through
 * y excluido de la captura) y notificación al conectar.
 */
export class SessionIndicators {
  private readonly tray: Tray;
  private overlay: BrowserWindow | null = null;
  private live = false;

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(this.icon(false));
    this.tray.on('click', () => actions.open());
    this.refreshTray(null);
  }

  get isLive(): boolean {
    return this.live;
  }

  get hasOverlay(): boolean {
    return this.overlay !== null && !this.overlay.isDestroyed();
  }

  sessionStarted(deviceName: string, display: Display = screen.getPrimaryDisplay()): void {
    this.live = true;
    this.refreshTray(deviceName);
    this.showOverlay(display);
    if (Notification.isSupported()) {
      new Notification({
        title: 'Kilorito Remote',
        body: `${deviceName} está controlando esta PC. Ctrl+Alt+Shift+K corta la sesión.`,
        icon: resourcePath('icon.png'),
      }).show();
    }
  }

  notify(body: string): void {
    if (Notification.isSupported()) new Notification({ title: 'Kilorito Remote', body, icon: resourcePath('icon.png') }).show();
  }

  /** Mueve el borde al monitor que se está transmitiendo. */
  displayChanged(display: Display): void {
    if (this.live) this.showOverlay(display);
  }

  sessionEnded(): void {
    this.live = false;
    // Primero el borde: es el indicador que más importa que desaparezca.
    this.hideOverlay();
    try {
      this.refreshTray(null);
    } catch (err) {
      console.error('[kr] no se pudo actualizar el tray', err);
    }
  }

  destroy(): void {
    this.hideOverlay();
    this.tray.destroy();
  }

  private icon(live: boolean) {
    return nativeImage.createFromPath(resourcePath(live ? 'tray-live.png' : 'tray-idle.png'));
  }

  private refreshTray(deviceName: string | null): void {
    this.tray.setImage(this.icon(this.live));
    this.tray.setToolTip(deviceName ? `Kilorito Remote: ${deviceName} conectado` : 'Kilorito Remote: esperando conexión');
    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: 'Abrir Kilorito Remote', click: () => this.actions.open() },
        { label: 'Cortar sesión  (Ctrl+Alt+Shift+K)', enabled: this.live, click: () => this.actions.endSession() },
        { type: 'separator' },
        { label: 'Salir', click: () => this.actions.quit() },
      ]),
    );
  }

  private showOverlay(display: Display): void {
    this.hideOverlay();
    const { x, y, width, height } = display.bounds;
    const win = new BrowserWindow({
      x,
      y,
      width,
      height,
      transparent: true,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      skipTaskbar: true,
      hasShadow: false,
      alwaysOnTop: true,
      show: false,
      backgroundColor: '#00000000',
      webPreferences: securePreferences(),
    });
    hardenWebContents(win.webContents);
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setIgnoreMouseEvents(true);
    // Windows 10 2004+: WDA_EXCLUDEFROMCAPTURE, el borde no aparece en el video del celular.
    win.setContentProtection(true);
    win.setBounds(display.bounds);
    // En Windows crear una ventana puede procesar otros eventos (p. ej. el atajo de corte) antes de volver:
    // si la sesión terminó mientras tanto, este borde ya no corresponde.
    if (!this.live) {
      win.destroy();
      return;
    }
    this.overlay = win;
    loadPage(win, 'overlay')
      .then(() => {
        if (win.isDestroyed()) return;
        if (this.live && this.overlay === win) win.showInactive();
        else win.destroy();
      })
      .catch(() => {
        // Se destruyó mientras cargaba (la sesión terminó): nada que hacer.
      });
  }

  private hideOverlay(): void {
    const win = this.overlay;
    this.overlay = null;
    if (!win || win.isDestroyed()) return;
    win.hide();
    win.close();
    if (!win.isDestroyed()) win.destroy();
  }
}
