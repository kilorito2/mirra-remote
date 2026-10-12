# Tareas

Verificación estándar de cada tarea: `npm run typecheck && npm run lint && npm test` (+ la indicada).

## Fase 1 — Base, seguridad y entorno de test
- [x] 1.1 Scaffolding electron-vite (main/preload/renderer) + client Vite + shared, TS strict, ESLint, Vitest, Playwright, Tailwind. Acc: `npm run dev` abre la ventana; `check` verde. Files: package.json, configs, src/*, client/*
- [x] 1.2 `shared/protocol.ts` + `constants.ts` con todos los schemas de PROTOCOL.md. Acc: tests de casos válidos/ inválidos por mensaje (strict, rangos, Ctrl+Alt+Supr rechazado).
- [x] 1.3 Allowlist IP + rate limiter + gating de test mode (puros). Acc: tests RFC1918/link-local/ULA/CGNAT/IPv4-mapped; loopback rechazado sin test mode.
- [x] 1.4 Certificados (CA + leaf con SAN, regeneración por IP) + server HTTPS estático con headers y filtro TCP + `/ca.crt`. Acc: test de integración con `https.get` (headers, 404, traversal).
- [x] 1.5 Token (32 B, uso único, 2 min, rotación) y PIN (6 dígitos, 2 min, 5/IP → 5 min, 10 global → regenera). Acc: tests con reloj falso.
- [x] 1.6 DeviceStore (secreto cifrado con un `Cipher` inyectado = safeStorage) + HMAC challenge. Acc: tests de HMAC compatible con WebCrypto, nonce de un uso y vencimiento, revocar.
- [x] 1.7 Signaling WS (máquina de estados, Origin, timeouts, BUSY, errores). Acc: test de integración con cliente `ws` real: pairing, auth, BUSY, AUTH_FAILED, token reusado.
- [x] 1.8 UI de PC: QR/PIN/IPs/estado/dispositivos/revocar/primer arranque + diálogo de aprobación + preload `ui` + validación de sender. Acc: tests de componentes; manual en dev.
- [x] 1.9 Client: pantallas de pairing (QR fragment, PIN), credenciales en localStorage, HMAC con `crypto.subtle`, reconexión. Acc: tests de componentes + E2E.
- [x] 1.10 Indicadores: tray rojo, overlay con borde (content protection), notificación, Ctrl+Alt+Shift+K. Acc: E2E verifica estado vía API de test.
- [x] 1.11 E2E desktop (Chromium móvil + WebKit): QR, PIN, no emparejado rechazado, token reusado rechazado, revocado rechazado.
- [x] 1.12 Android: `android:setup` (JDK, cmdline-tools, imagen 34 google_apis, AVD remote-test) + esqueleto `test:android` que empareja por QR y PIN.
- [x] Checkpoint F1: security-review + review + simplify; PROGRESS; commit `feat(fase-1): ...`

## Fase 2 — Video
- [ ] 2.1 Renderer host + `setDisplayMediaRequestHandler` + HostPeer (oferta, DataChannels negociados, relay de signaling por IPC).
- [ ] 2.2 Client: RTCPeerConnection que contesta, `<video playsinline autoplay muted>` a pantalla completa.
- [ ] 2.3 Preferencia H.264 → VP8 y presets con `setParameters` (en vivo desde PC y celular).
- [ ] 2.4 ICE restart / reconexión WS con `session.join{resume}`; ADR-0007 resuelto.
- [ ] 2.5 Android: `videoWidth>0`, `framesDecoded` sube, screencap revisado.
- [ ] Checkpoint F2

## Fase 3 — Control
- [ ] 3.1 Puertos + FakeInjector + RobotJsInjector + InputController (clamp, rate limit, watchdog 3 s, releaseAll, seq).
- [ ] 3.2 `shared/coords.ts` (normalizado ⇄ físico; 100/125/150 %, 2 monitores) + rect físico en main.
- [ ] 3.3 Reconocedor de gestos puro + aceleración (trackpad, directo, scroll, drag, tap 2 dedos, pinch).
- [ ] 3.4 Superficie de video: zoom/paneo local, sigue al cursor, `touch-action:none`, envío por canales.
- [ ] 3.5 Teclado (input oculto, diff de texto) + barra de teclas especiales/combos (sticky, Win+L aviso, Ctrl+Alt+Supr deshabilitado).
- [ ] 3.6 E2E desktop gestos → FakeInjector; Android con robotjs: posición, multitouch CDP, textarea con ñ/tildes/@, releaseAll al cortar.
- [ ] Checkpoint F3

## Fase 4 — Extras
- [ ] 4.1 Audio loopback + botón activar en celular.
- [ ] 4.2 Portapapeles bidireccional.
- [ ] 4.3 Archivos celular→PC (stream a Descargas/Kilorito Remote, sanitizado, ack/backpressure, cancelar).
- [ ] 4.4 Archivos PC→celular (botón + drag&drop, Blob, progreso, cancelar).
- [ ] 4.5 Multi-monitor (`replaceTrack`), stats overlay, Wake Lock, fullscreen, PWA manifest.
- [ ] 4.6 Android: portapapeles ambos sentidos, archivo, wifi off/on reconecta.
- [ ] Checkpoint F4

## Fase 5 — Hardening y release
- [ ] 5.1 Bounty hunt (pairing + protocolo) y fixes con tests.
- [ ] 5.2 electron-builder NSIS, asarUnpack, assert-no-test-mode, ícono.
- [ ] 5.3 README + docs/TESTING-MANUAL.md + SECURITY.md final.
- [ ] 5.4 Todo verde (typecheck, lint, unit, E2E, android) + ship checklist.
- [ ] CHECKPOINT FINAL (manual del usuario)
