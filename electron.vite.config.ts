import { resolve } from 'node:path';
import { defineConfig } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import type { Plugin } from 'vite';

/** CSP de las ventanas de Electron. En dev se relaja solo lo que necesita el HMR de Vite. */
function rendererCsp(): Plugin {
  let dev = false;
  return {
    name: 'kr-renderer-csp',
    configResolved(config) {
      dev = config.command === 'serve';
    },
    transformIndexHtml() {
      const csp = [
        "default-src 'self'",
        dev ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'",
        dev ? "style-src 'self' 'unsafe-inline'" : "style-src 'self'",
        "img-src 'self' data: blob:",
        "media-src 'self' blob:",
        "font-src 'self'",
        dev ? "connect-src 'self' ws://localhost:*" : "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'none'",
      ].join('; ');
      return [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: csp }, injectTo: 'head-prepend' }];
    },
  };
}

// ADR-0008: `--mode production` (build:prod) compila REMOTE_TEST_MODE fuera del bundle.
export default defineConfig(({ mode }) => {
  const define = { __KR_ALLOW_TEST_MODE__: JSON.stringify(mode !== 'production') };
  const alias = { '@shared': resolve('src/shared') };
  return {
    main: {
      define,
      resolve: { alias },
      build: {
        externalizeDeps: true,
        rollupOptions: { input: { index: resolve('src/main/index.ts') } },
      },
    },
    preload: {
      define,
      resolve: { alias },
      build: {
        // Preloads con sandbox: CommonJS y sin dependencias externas (solo pueden require('electron')).
        externalizeDeps: false,
        rollupOptions: {
          input: { ui: resolve('src/preload/ui.ts'), host: resolve('src/preload/host.ts') },
          output: { format: 'cjs', entryFileNames: '[name].cjs' },
        },
      },
    },
    renderer: {
      root: 'src/renderer',
      define,
      resolve: { alias },
      plugins: [react(), tailwindcss(), rendererCsp()],
      build: {
        assetsInlineLimit: 0,
        rollupOptions: {
          input: {
            index: resolve('src/renderer/index.html'),
            host: resolve('src/renderer/host.html'),
            overlay: resolve('src/renderer/overlay.html'),
          },
        },
      },
    },
  };
});
