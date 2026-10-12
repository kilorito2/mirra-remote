# Kilorito Remote

Controlá tu PC con Windows 10/11 desde el navegador del celular. La pantalla y el audio viajan por WebRTC directo por tu
WiFi (o Tailscale) y desde el celular manejás mouse y teclado. Sin app en el celular: se abre una web que sirve la PC.

- Emparejamiento por QR o PIN, con aprobación en la PC y reconexión automática (challenge-response, el secreto no vuelve a viajar).
- Video H.264 por hardware (fallback VP8 y fallback automático a software), presets Nítido / Fluido / Ahorro en vivo.
- Gestos de trackpad o táctil directo, zoom local, teclado del celular (ñ, tildes, @, €), teclas especiales y combinaciones.
- Audio, portapapeles, archivos en los dos sentidos, multi-monitor, estadísticas.
- Seguridad: solo IPs de la red local o Tailscale, HTTPS con CA propia, un controlador a la vez, tray rojo + borde + Ctrl+Alt+Shift+K para cortar,
  y nunca quedan teclas apretadas si se corta la conexión.

## Usar
1. Instalá `Kilorito Remote Setup.exe` y abrilo. Windows va a pedir permiso de red: marcá **solo Redes privadas**.
2. Con el celular en la misma WiFi, escaneá el QR de la ventana (o abrí la dirección y escribí el PIN).
3. El navegador avisa que el certificado no es de confianza: es el certificado propio de tu PC. Aceptalo
   (o instalá la CA desde "Sacar la advertencia de seguridad del celular" para que no vuelva a aparecer).
4. Aceptá la conexión en la PC. Listo: la próxima vez conecta solo.

Cortar: botón "Cortar sesión", menú del tray o **Ctrl+Alt+Shift+K** desde cualquier lugar.

## Desarrollo

Requisitos: Node 22+ y Windows 10/11.

| Comando | Qué hace |
|---|---|
| `npm install` | Dependencias (robotjs trae binario N-API; no hacen falta Build Tools) |
| `npm run dev` | App en modo desarrollo |
| `npm run check` | Typecheck + lint + tests unitarios |
| `npm test` | Vitest (unit + componentes) |
| `npm run test:e2e` | Playwright: app Electron real + Chromium móvil + WebKit (FakeInjector) |
| `npm run test:e2e:real` | Clic y tipeo con el injector real en una ventana de prueba (**mueve el mouse**) |
| `npm run android:setup` | Instala JDK portable, cmdline-tools, imagen Android 14 y el AVD `remote-test` (sin admin) |
| `npm run test:android` | Suite con el emulador (**mueve el mouse**). `KR_WIPE=1` borra los datos del AVD si quedó trabado |
| `npm run dist` | Build de producción, verifica que no haya modo test y genera el instalador NSIS en `release/` |

Variables solo para tests (no existen en el build de producción, ADR-0008): `REMOTE_TEST_MODE=1`, `KR_INJECTOR=fake`,
`KR_AUTO_APPROVE=1`, `KR_PORT`, `KR_USER_DATA`, `KR_HW_ENCODE=0|1`.

## Estructura

```
src/main/       server HTTPS/WSS, auth, sesión, InputController, archivos, tray, overlay, IPC, ports/ y adapters/
src/preload/    ui.ts (ventana principal) y host.ts (renderer host), con contextBridge
src/renderer/   UI de la PC + host/HostPeer.ts (captura y RTCPeerConnection)
src/shared/     protocolo (zod), coordenadas, constantes, media
client/         web del celular (Vite + React), servida por la PC
tests/          e2e/ (Playwright desktop), android/ (emulador), support/
docs/           SPEC, ARCHITECTURE, PROTOCOL, SECURITY, TESTING-MANUAL, PROGRESS, adr/
```

Arquitectura y decisiones: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), [docs/adr/](docs/adr/). Protocolo:
[docs/PROTOCOL.md](docs/PROTOCOL.md). Seguridad: [docs/SECURITY.md](docs/SECURITY.md). Prueba manual:
[docs/TESTING-MANUAL.md](docs/TESTING-MANUAL.md).

## Límites conocidos
- No controla el escritorio seguro (UAC, pantalla de login, Ctrl+Alt+Supr) ni ventanas elevadas: requiere un servicio nativo
  de Windows (fuera de alcance; el puerto `InputInjector` está listo para enchufarlo).
- Solo red local o Tailscale (sin TURN ni relay). Un controlador a la vez. El contenido con DRM se ve negro.
