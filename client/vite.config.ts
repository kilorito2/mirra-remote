import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = resolve(import.meta.dirname);

export default defineConfig({
  root,
  base: '/',
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@shared': resolve(root, '..', 'src', 'shared') } },
  build: {
    outDir: resolve(root, '..', 'dist-client'),
    emptyOutDir: true,
    target: ['chrome110', 'safari16'],
    // Sin scripts ni estilos inline: la CSP del server es estricta.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
});
