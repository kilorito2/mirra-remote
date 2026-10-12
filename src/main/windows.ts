import { join } from 'node:path';
import { app, BrowserWindow, screen, session, type WebContents, type WebPreferences } from 'electron';

export type RendererPage = 'index' | 'host' | 'overlay' | 'testpad';

export function securePreferences(preload?: 'ui' | 'host'): WebPreferences {
  return {
    contextIsolation: true,
    sandbox: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false,
    devTools: !app.isPackaged,
    ...(preload ? { preload: join(import.meta.dirname, '..', 'preload', `${preload}.cjs`) } : {}),
  };
}

/** Sin popups, sin navegación, sin webviews: cada ventana solo muestra su página. */
export function hardenWebContents(wc: WebContents): void {
  wc.setWindowOpenHandler(() => ({ action: 'deny' }));
  wc.on('will-navigate', (event) => event.preventDefault());
  wc.on('will-redirect', (event) => event.preventDefault());
  wc.on('will-attach-webview', (event) => event.preventDefault());
}

/** Permisos: solo captura de pantalla, y solo para el renderer host. */
export function configurePermissions(isHost: (wc: WebContents | null) => boolean): void {
  const allowed = new Set(['media', 'display-capture']);
  session.defaultSession.setPermissionRequestHandler((wc, permission, callback) => {
    callback(allowed.has(permission) && isHost(wc));
  });
  session.defaultSession.setPermissionCheckHandler((wc, permission) => allowed.has(permission) && isHost(wc));
}

export async function loadPage(win: BrowserWindow, page: RendererPage): Promise<void> {
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (!app.isPackaged && devUrl) await win.loadURL(`${devUrl}/${page}.html`);
  else await win.loadFile(join(import.meta.dirname, '..', 'renderer', `${page}.html`));
}

/** URL esperada de cada página, para validar el sender de IPC. */
export function isPageUrl(url: string, page: RendererPage): boolean {
  try {
    const parsed = new URL(url);
    const devUrl = process.env['ELECTRON_RENDERER_URL'];
    if (!app.isPackaged && devUrl && url.startsWith(devUrl)) return parsed.pathname === `/${page}.html`;
    return parsed.protocol === 'file:' && parsed.pathname.endsWith(`/renderer/${page}.html`);
  } catch {
    return false;
  }
}

export function resourcePath(...parts: string[]): string {
  return join(app.getAppPath(), 'resources', ...parts);
}

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 420,
    height: Math.min(780, screen.getPrimaryDisplay().workAreaSize.height),
    minWidth: 380,
    minHeight: 560,
    show: false,
    title: 'Kilorito Remote',
    backgroundColor: '#0F2624',
    autoHideMenuBar: true,
    icon: resourcePath('icon.png'),
    webPreferences: securePreferences('ui'),
  });
  win.removeMenu();
  hardenWebContents(win.webContents);
  return win;
}
