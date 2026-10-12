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

## Fase 2 — Video ✅ (2026-10-12)
**Hecho**
- Renderer host oculto (`backgroundThrottling: false`) con `HostPeer`: `getDisplayMedia()` → handler de main
  (`desktopCapturer` + `audio: 'loopback'`, sin selector del sistema), la PC siempre ofertante, DataChannels negociados (0/1/2).
- H.264 primero con `setCodecPreferences` (`shared/media.ts`, puro y testeado) → negociado H.264 en desktop y Android.
- Presets en vivo con `setParameters` (contentHint, degradationPreference, fps, bitrate, `scaleResolutionDownBy` a 720p).
- `replaceTrack` preparado para multi-monitor (`display.set`), audio con m-line fija (activar/desactivar sin renegociar).
- Celular: `PhonePeer` (contesta, cola de candidatos, ICE restart a los 2 s de `disconnected` o en `failed`, chequeo al volver
  de segundo plano), `SessionScreen` con `<video playsinline autoplay muted>` y la sesión sigue visible si solo se cae el WS.
- Reanudación: `session.join{resume}` → ICE restart sin cortar; recargar la página vuelve a negociar.
- Puerto `ScreenSource` + `ElectronScreenSource` (rect físico con `dipToScreenRect`).
- ADR-0007 aceptado: no hizo falta tocar mDNS. ADR-0003 verificado.

**Tests**: 153 unit · 22 E2E desktop (4 de video en Chromium; WebKit sin WebRTC) · 4 Android (video H.264 1366×768,
`framesDecoded` sube, screencap revisado: se ve la pantalla de la PC y el borde rojo no aparece en la captura).

## Fase 3 — Control ✅ (2026-10-12)
**Hecho**
- Puerto `InputInjector` + `RobotJsInjector` (SendInput absoluto en el escritorio virtual, texto unicode por unidad UTF-16
  para que los emoji salgan bien) + `FakeInjector`.
- `InputController`: clamp al display elegido, rate limit 500/s (ráfaga 100), `seq` con wrap de 32 bits, registro de
  teclas/botones y `releaseAll` ante heartbeat ausente 3 s, `input.reset`, canal cerrado, fin de sesión o caída del host.
- `shared/coords.ts`: normalizado ⇄ físico con rect de `dipToScreenRect` (tests 100/125/150 % y 2 monitores con distinto DPI).
- Celular: reconocedor de gestos puro (trackpad con aceleración, tap/doble tap, 2 dedos = clic derecho/scroll, mantener y
  arrastrar, directo, pellizco = zoom local con paneo que sigue al cursor), `SurfaceController`, teclado oculto con diff
  de texto (keyCode 229), barra de teclas especiales con modificadores fijos, Win+L con aviso, Ctrl+Alt+Supr explicado,
  barra flotante que se esconde. `cursor.pos` de la PC al celular a ≤ 30 Hz.

**Tests**: 203 unit · 31 E2E desktop (9 de control con FakeInjector) · 1 E2E con injector real sin emulador
(`npm run test:e2e:real`: clic real en el textarea y "Ñandú @ café") · 9 Android con robotjs real (cursor, directo,
dos dedos, Ctrl liberado al cortar) + teclado del celular.

**Problemas de entorno encontrados (y cómo quedaron)**
- Tras usar el emulador con `-gpu auto`, el encoder H.264 por hardware de Chromium se colgaba (`addTransceiver` no volvía) y
  Chrome del emulador se caía al crear el contexto GL; finalmente la PC se colgó (Kernel-Power 41). Tras reiniciar, el
  encoder por hardware volvió a andar.
  - App: ajuste "Codificación por hardware" (activado) + watchdog de 10 s sin oferta ⇒ se desactiva y la app se reinicia sola.
  - Tests: H.264 por software por defecto (`KR_E2E_HW=1` usa hardware).
  - Emulador: `-gpu swiftshader_indirect -feature -Vulkan` (SwiftShader Vulkan también lo tiraba); locks viejos se limpian;
    `KR_WIPE=1` borra los datos del AVD si queda trabado.
- La captura de Windows solo entrega frames si la pantalla cambia: los tests abren una ventana animada (testpad).
- Teclado con injector real dentro del emulador fallaba por foco de ventanas de Windows (emulador encima); el camino de
  inyección real se prueba sin emulador y el teclado del celular en Android con FakeInjector.

## Fase 4 — Extras ✅ (2026-10-12)
**Hecho**
- Audio Opus del loopback (m-line fija); el celular arranca muteado y se activa con el botón dentro del toque (iOS).
- Portapapeles de texto en ambos sentidos (`clipboard` de Electron, async en v44; `navigator.clipboard` con alternativa
  manual si el navegador no deja leer/escribir).
- Archivos celular → PC: canal `file`, chunks de 16 KiB, `bufferedAmountLowThreshold`, ventana de 8 MiB con ack cada MiB,
  escritura en stream a `.part` (`wx`, nunca pisa), nombre saneado (rutas, reservados de Windows, controles, bidi),
  tamaño exacto o se descarta. Destino: `Descargas/Kilorito Remote`.
- Archivos PC → celular: botón "Enviar al celular" y soltar sobre la ventana; lectura en bloques de 256 KiB con pausa por
  ventana de acks; el celular arma un Blob (máx. 512 MiB) y lo descarga. Progreso y cancelar en las dos puntas.
- Celular: hoja "Más" (pantalla, calidad, estadísticas, pantalla completa + orientación horizontal), overlay de stats
  (RTT, fps, bitrate, pérdida, resolución, codec), Wake Lock (se vuelve a pedir al volver de segundo plano).

**Tests**: 231 unit · 37 E2E desktop (portapapeles, archivos en ambos sentidos, stats, audio, corte de red) ·
12 Android (portapapeles, archivo, corte de WiFi del emulador con reconexión, más lo de fases anteriores).

**Sin cobertura automática**: multi-monitor (esta PC tiene una sola pantalla): el cambio con `replaceTrack` y el borde que
se mueve quedan en el checklist manual.
