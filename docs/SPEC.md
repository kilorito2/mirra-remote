# Spec: Kilorito Remote

> Fuente: `prompt-kilorito-remote.md` + correcciones acordadas el 2026-10-12 (ver ADRs 0001–0008).
> Documento vivo: si una decisión cambia, se actualiza acá primero.

## Objetivo

Controlar una PC con Windows 10/11 desde el navegador del celular (Chrome Android, Safari iOS) sin app nativa.
La PC transmite pantalla + audio por WebRTC y recibe mouse/teclado del celular. Conexión directa por LAN o por Tailscale.

**Usuario:** el dueño de la PC, en su propia red. No es multiusuario: un controlador a la vez.

**Éxito:** abro la web desde el QR, apruebo el dispositivo una vez, y a partir de ahí controlo la PC con fluidez
(1080p ≥ 30 fps, RTT < 30 ms en WiFi 5 GHz), sin teclas trabadas y con reconexión sola.

### Historias
1. Como dueño, escaneo un QR (o tipeo un PIN) y apruebo el celular en la PC → queda emparejado.
2. Como dueño emparejado, abro la web y conecta sola (challenge-response, sin volver a aprobar).
3. Veo la pantalla con audio opcional y elijo monitor/calidad en vivo.
4. Muevo el mouse como trackpad o tocando directo, hago clic, scroll, arrastre y zoom local.
5. Escribo con el teclado del celular (ñ, tildes, @, €) y uso teclas especiales/combos.
6. Paso texto del portapapeles y archivos en ambos sentidos.
7. Si la sesión se corta, nada queda apretado en la PC y reconecta sola cuando vuelve la red.
8. Desde la PC veo siempre que hay una sesión activa y la corto con Ctrl+Alt+Shift+K.

## Mapa de capacidades (orden de construcción)

| Módulo | Responsabilidad | Depende de |
|---|---|---|
| `shared` | Schemas zod del protocolo, coords, constantes | — |
| `pairing` | Server HTTPS/WSS, allowlist IP, certs/CA, token/PIN, aprobación, credenciales, challenge-response, indicadores | shared |
| `video` | Captura, RTCPeerConnection, codecs, presets, multi-monitor, reconexión ICE | pairing |
| `control` | DataChannels de input, gestos, coords, teclado, teclas especiales, liberación de teclas | video |
| `extras` | Audio, portapapeles, archivos, stats | control |
| `release` | Hardening, instalador NSIS, docs finales | todos |

Build order: shared → pairing → video → control → extras → release (= Fases 1–5).

## Requisitos funcionales (resumen verificable)

### Emparejamiento y acceso (Fase 1)
- R1. HTTPS + WSS en puerto 47800 (configurable). Certificado de servidor firmado por una CA local generada en el primer arranque y guardada en `userData` (clave privada cifrada con `safeStorage`). La CA es opcionalmente instalable en el celular (`/ca.crt`) — ADR-0001.
- R2. Se rechaza a nivel TCP toda conexión cuyo IP remoto no sea RFC1918, link-local (169.254/16, fe80::/10), ULA (fc00::/7) o Tailscale (100.64/10). Loopback solo con `REMOTE_TEST_MODE`, que no existe en el build de producción.
- R3. QR `https://<ip>:<puerto>/#t=<token>`; token 32 bytes aleatorios (base64url), un solo uso, vence a los 2 min y se regenera solo.
- R4. PIN de 6 dígitos válido 2 min. 5 intentos fallidos por IP → bloqueo de esa IP por 5 min. 10 fallos totales sobre el mismo PIN → el PIN se invalida y se regenera.
- R5. Token/PIN válido → diálogo "¿Permitir que <dispositivo> controle esta PC?" (Aceptar/Rechazar, rechaza solo a los 60 s). En `REMOTE_TEST_MODE` se puede autoaprobar.
- R6. Al aceptar: `deviceId` (16 B) + `deviceSecret` (32 B). El celular los guarda en localStorage; la PC guarda el secreto cifrado con `safeStorage`.
- R7. Reconexión: nonce de 32 B → el celular responde HMAC-SHA256(secret, `"kr-auth-v1:" + nonce`) con `crypto.subtle`. El secreto no vuelve a viajar.
- R8. Un controlador a la vez (el segundo recibe `BUSY`). Lista de dispositivos con revocar (revocar corta la sesión si está activa).
- R9. Sesión activa ⇒ tray rojo + borde de color (overlay click-through, excluido de la captura) + notificación + atajo global Ctrl+Alt+Shift+K que corta al instante.

### Video (Fase 2)
- R10. Captura vía `setDisplayMediaRequestHandler` (`{ video: source, audio: 'loopback' }`) + `getDisplayMedia()` en el renderer host.
- R11. H.264 preferido con `setCodecPreferences`, fallback VP8.
- R12. Presets en vivo con `setParameters`: Nítido (detail, maintain-resolution, 30 fps, 8 Mbps), Fluido (motion, maintain-framerate, 60 fps, 15 Mbps), Ahorro (≤720p, 3 Mbps).
- R13. Multi-monitor: el celular elige pantalla; se cambia con `replaceTrack` sin renegociar.
- R14. Sin STUN/TURN. Reconexión con ICE restart ante caída de red o bloqueo del celular.
- R15. Overlay de stats opcional: RTT, fps, bitrate, pérdida.

### Control (Fase 3)
- R16. Canales `input-fast` (unordered, maxRetransmits 0, solo movimiento), `control` (confiable/ordenado), `file` (confiable).
- R17. Coordenadas normalizadas [0,1] al frame; main las mapea al display elegido respetando escalado. Todo clic lleva su coordenada.
- R18. Reconocedor de gestos puro: trackpad (default) y táctil directo; pellizcar = zoom local con paneo que sigue al cursor.
- R19. Teclado: input oculto enfocado dentro del gesto; texto por `beforeinput`/`input` (diff), backspace/enter; ñ, tildes, @, €.
- R20. Barra de teclas especiales y combos; Ctrl+Alt+Supr deshabilitado ("requiere el servicio nativo"); Win+L con advertencia.
- R21. Validación zod de cada mensaje (host y main), clamp de coordenadas, rate limit ~500 msg/s, heartbeat 1 s; sin heartbeat 3 s, canal cerrado o sesión terminada ⇒ `releaseAll()`.

### Extras (Fase 4)
- R22. Audio Opus del loopback; el celular arranca muteado con botón para activar (`<video playsinline autoplay muted>`).
- R23. Portapapeles texto en ambos sentidos ("Mandar a la PC" / "Traer de la PC").
- R24. Archivos celular→PC por `file` en chunks de 16 KB con backpressure; se guardan en `Descargas/Kilorito Remote` con nombre sanitizado y escritura en stream.
- R25. Archivos PC→celular con botón o drag&drop en la ventana; el celular descarga Blob. Progreso y cancelar en ambos sentidos.
- R26. Wake Lock, pantalla completa (Fullscreen API en Android; PWA en iOS), horizontal recomendado.

### App de PC (Fases 1–5)
- R27. Vive en el tray. Ventana compacta: QR/PIN, IP + puerto, estado, dispositivo conectado, presets, audio on/off, dispositivos emparejados, "Iniciar con Windows" (off por defecto).
- R28. Electron endurecido: contextIsolation, sandbox, nodeIntegration false, CSP estricta, contextBridge, validación de sender en IPC, `setWindowOpenHandler` → deny.
- R29. Primer arranque: aviso de firewall (permitir solo redes privadas).

## Tech stack

| Área | Elección | Versión |
|---|---|---|
| Runtime PC | Electron | 44.x |
| Build PC | electron-vite (Vite 7, por compatibilidad) | 5.x |
| UI | React 19 + Tailwind 4 | |
| Lenguaje | TypeScript strict (6.0, por typescript-eslint) | 6.0.x |
| Server | `node:https` + `ws` | ws 8.x |
| Validación | zod | 4.x |
| Input | `@jitsi/robotjs` (N-API, prebuild win32-x64) — ADR-0002 | 0.6.x |
| QR | qrcode | 1.5.x |
| Certificados | selfsigned (o node-forge si no soporta firmar con CA) — ADR-0001 | |
| Tests | Vitest 5 + Testing Library + Playwright 1.64 (`_electron`, `_android`) | |
| Empaquetado | electron-builder NSIS, nativos en `asarUnpack` | 26.x |

## Commands

```
npm install
npm run dev              # electron-vite dev (UI + host) + client en watch
npm run build            # build de desarrollo/test (permite REMOTE_TEST_MODE)
npm run build:prod       # build de producción (REMOTE_TEST_MODE eliminado en compilación)
npm run dist             # build:prod + electron-builder --win nsis
npm run typecheck        # tsc -b (main, preload, renderer, client, shared, tests)
npm run lint             # eslint .
npm test                 # vitest run (unit + componentes)
npm run test:e2e         # playwright: _electron + chromium mobile + webkit (FakeInjector)
npm run test:android     # emulador remote-test + Playwright _android (RobotJsInjector real)
npm run android:setup    # instala JDK portable, cmdline-tools, imagen y AVD remote-test
npm run check            # typecheck + lint + test
```

## Project structure

```
kilorito-remote/
  src/main/          index.ts, server/, auth/, session/, capture/, overlay/, tray/, ipc/, files/, ports/, adapters/
  src/preload/       ui.ts (ventana principal), host.ts (renderer host)
  src/renderer/      UI de la PC (index.html) + host/ (host.html, HostPeer.ts)
  src/shared/        protocol.ts, coords.ts, constants.ts (+ tests colocados *.test.ts)
  client/            web app del celular (Vite root) → build a dist-client/, servida por main
  tests/e2e/         Playwright desktop
  tests/android/     Playwright _android + scripts del emulador
  docs/              SPEC, ARCHITECTURE, PROTOCOL, SECURITY, TESTING-MANUAL, PROGRESS, adr/
  tasks/             plan.md, todo.md
```

## Code style

- TS strict, `noUncheckedIndexedAccess`, sin `any` (lint error), sin `@ts-ignore`.
- Datos externos (WS, DataChannel, IPC, archivos, env) se parsean con zod en el borde; adentro se confía en los tipos.
- Errores de protocolo: siempre `{ t: 'error', code, message }` con `code` de un enum cerrado.
- Lógica pura separada de efectos (gestos, coords, token/PIN, diff de texto, rate limit) para testear sin Electron.
- Nombres: archivos de módulo en camelCase, componentes React en PascalCase, constantes UPPER_SNAKE.

```ts
// Ejemplo de estilo: puerto + validación en el borde
export interface InputInjector {
  moveTo(p: ScreenPoint): Promise<void>;
  button(b: MouseButton, action: 'down' | 'up'): Promise<void>;
  releaseAll(): Promise<void>;
}

const parsed = ControlMessage.safeParse(raw);
if (!parsed.success) return reject('BAD_MESSAGE');
await controller.handle(parsed.data);
```

## Testing strategy

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unit | Vitest | schemas, coords (100/125/150 %, 2 monitores con distinto DPI), token/PIN (vencimiento, uso único, bloqueo), HMAC, allowlist IP (loopback rechazado sin test mode), gestos, diff de texto, rate limit, liberación de teclas |
| Componentes | Vitest + Testing Library (jsdom) | pantallas de pairing, barra de teclas, panel de PC |
| E2E desktop | Playwright `_electron` + Chromium móvil | pairing QR/PIN, aprobación, gestos → FakeInjector, rechazo de no emparejados/revocados, token reusado |
| E2E WebKit | Playwright WebKit | pairing, auth y UI. **Sin WebRTC** (WebKit de Windows no lo trae) — ADR-0006 |
| Android | Playwright `_android` + emulador `remote-test` | video (videoWidth, framesDecoded, screencap), gestos/teclado con robotjs real, seguridad, portapapeles, archivos, reconexión |
| Manual | docs/TESTING-MANUAL.md | Chrome Android real, Safari iOS, fluidez/RTT |

## Boundaries

- **Siempre:** validar con zod en cada borde; typecheck + lint + tests antes de cada commit de fase; actualizar PROGRESS.md; avisar por consola antes de mover el mouse real.
- **Preguntar primero:** dependencias nuevas no listadas acá; cambios al protocolo que rompan compatibilidad; cualquier cosa que requiera admin en Windows.
- **Nunca:** `REMOTE_TEST_MODE` o FakeInjector en el build de producción; loguear tokens, PIN, secretos o nonces; usar `any`; desactivar tests para pasar; servir algo fuera de `dist-client` y `/ca.crt`.

## Criterios de aceptación

1. 1080p ≥ 30 fps en WiFi 5 GHz con RTT < 30 ms en el overlay (checkpoint manual).
2. Dispositivo sin emparejar o revocado no puede conectarse ni mandar input (E2E + Android).
3. Nunca quedan teclas/botones trabados al cortarse la conexión (unit + Android).
4. Reconecta solo tras corte de WiFi o bloqueo del celular (Android + manual).
5. Funciona en Chrome Android y Safari iOS (Android + manual).
6. Typecheck, lint, unit, E2E y `test:android` en verde, sin `any`.

## Fuera de alcance
Servicio nativo de Windows (UAC, login, SendSAS), Wake-on-LAN, TURN/relay/internet, macOS/Linux (portable pero no probado),
varios controladores, contenido DRM (queda negro por diseño), inyección en ventanas elevadas (UIPI).

## Preguntas abiertas
- Ninguna bloqueante. Riesgos a validar en el checkpoint: PWA iOS con CA no instalada; H.264 por hardware en la PC del usuario.
