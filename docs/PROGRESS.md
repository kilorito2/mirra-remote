# Progreso

## Fase 0 — Spec y plan ✅ (2026-10-12)
- docs/SPEC.md, ARCHITECTURE.md (Mermaid), PROTOCOL.md, SECURITY.md (modelo de amenazas inicial).
- ADRs 0001–0008 (CA local, robotjs, H.264, canales, hexagonal, emulador Android, ICE/mDNS [propuesto], test mode).
- tasks/plan.md y tasks/todo.md.
- Correcciones al prompt acordadas con el usuario: robotjs en vez del fork de nut.js (sin releases desde 2025-03),
  sin @electron/rebuild (N-API), WebKit de Playwright sin WebRTC, overlay con content protection, tope global de PIN,
  CA local opcional, Vite 7 (electron-vite 5) y TypeScript 6.0 (typescript-eslint).
- Entorno: Node 24.18, WHPX usable, Android SDK presente sin cmdline-tools ni Java (se instalan portables en Fase 1).
- Skills `ecc:*` no existen en este entorno; se usan equivalentes (ver mapeo en SPEC/plan).

## Fase 1 — Base, seguridad y entorno de test ✅ (2026-10-12)
**Hecho**
- Scaffolding electron-vite (main/preload/renderer) + client Vite + shared; TS 6 strict, ESLint strict-type-checked, Vitest, Playwright.
- `shared/protocol.ts`: todos los schemas de PROTOCOL.md (strict, Ctrl+Alt+Supr rechazado, texto sin controles).
- Server HTTPS (CA local con Name Constraints + certificado de servidor regenerable sin reinicio), estáticos desde un índice
  en memoria, CSP y headers, `/ca.crt`, filtro de IP en `connection` TCP antes del TLS.
- Auth: token QR (32 B, un uso, 2 min), PIN (5/IP → 5 min; 10 globales → PIN nuevo), aprobación (60 s, una a la vez),
  DeviceStore con `safeStorage`, challenge-response HMAC compartido (WebCrypto en celular y en main).
- Signaling WSS: máquina de estados, Origin + Host IP-only, tope de 16 conexiones sin autenticar, rate limit pre/post auth,
  control único (BUSY), revocar corta la sesión.
- UI de PC: QR, PIN, red, presets, audio, dispositivos (revocar), iniciar con Windows, aviso de firewall, instrucciones de la CA.
- Celular: emparejamiento QR (token sacado del fragment y del historial) y PIN, reconexión automática con backoff.
- Indicadores: tray rojo, borde con `setContentProtection`, notificación, Ctrl+Alt+Shift+K.
- Íconos propios generados por script (ojo de lorito).
- Entorno Android: JDK 21 portable, cmdline-tools, imagen android-34 google_apis x86_64, AVD `remote-test` (WHPX).

**Tests**: 148 unit/componentes · 18 E2E desktop (Chromium móvil + WebKit) · 3 Android (QR por intent, PIN, rechazos).

**Problemas encontrados y resueltos**
- `electron-vite build` usa `--mode production` por defecto: el build normal salía sin test mode. `npm run build` usa `--mode e2e`.
  (De paso quedó verificado que el build de producción no contiene `REMOTE_TEST_MODE`.)
- Carrera del overlay: en Windows, `new BrowserWindow()` puede procesar otros eventos antes de volver; un corte en ese
  instante dejaba el borde visible. Ahora se descarta si la sesión terminó mientras se creaba o cargaba.
- `_android.launchBrowser()` no ve las pestañas abiertas por intent → flags de Chrome + `connectOverCDP` (ADR-0006 actualizado).
- Chrome 113 / Android 14 tapa la pantalla con la promo de notificaciones y el emulador muestra ANR: permiso concedido y
  `hide_error_dialogs`.
- `@peculiar/x509` necesita `reflect-metadata` (dependencia agregada); `selfsigned` no soporta Name Constraints, se usa x509 directo.

**Revisión de seguridad (cierre de Fase 1)** — inline: la skill `security-review` requiere un remoto `origin/HEAD` y el repo
no tiene. Hallazgos corregidos con tests: (1) el timeout de 15 s sin autenticar cortaba el diálogo de aprobación;
(2) sin tope de conexiones sin autenticar; (3) Host con nombre de dominio (DNS rebinding) ahora se rechaza. Ver SECURITY.md.

**Desvíos del prompt**
- Skills `ecc:*` no instaladas; se usaron los equivalentes de `agent-skills:*` y `frontend-design:*`.
- Playwright Android vía CDP en lugar de `launchBrowser` (motivo arriba).
