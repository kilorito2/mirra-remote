# ADR-0006: Testing E2E con emulador Android y Playwright `_android`

## Estado
Aceptado — 2026-10-12

## Contexto
La app se usa desde navegadores móviles reales. Playwright `_android` automatiza Chrome en un dispositivo/emulador vía ADB,
pero necesita pasarle flags a Chrome (imagen con root, o flag manual en chrome://flags). Los AVD existentes usan imágenes
Play Store (sin root). El WebKit de Playwright en Windows **no trae WebRTC**.

## Decisión
- AVD `remote-test`: `system-images;android-34;google_apis;x86_64` (con root, sin Play Store), aceleración WHPX.
- Setup reproducible con `npm run android:setup` (JDK portable + cmdline-tools dentro del SDK, sin admin).
- Conexión: `adb reverse tcp:47800 tcp:47800` → el emulador abre `https://127.0.0.1:47800/#t=…` con
  `adb shell am start -a android.intent.action.VIEW -d <url>`; la app corre con `REMOTE_TEST_MODE` (acepta loopback, autoaprueba).
- ~~`launchBrowser({ ignoreHTTPSErrors: true })`~~ → ver "Actualización 2026-10-12". Multitouch por CDP `Input.dispatchTouchEvent`.
- Video: `videoWidth > 0`, `framesDecoded` creciente, `adb exec-out screencap -p` revisado a ojo.
- Control con `RobotJsInjector` real, verificando con `robot.getMousePos()`. Se avisa por consola antes de mover el mouse.
- Suite WebKit de escritorio: solo pairing/auth/UI (los tests de WebRTC se saltean con motivo explícito).

## Consecuencias
- La suite Android es lenta (arranque del emulador) y mueve el mouse real: no corre en `npm test`.
- Safari real se valida solo en el checkpoint manual.

## Actualización 2026-10-12 (Fase 1)
`_android.launchBrowser()` crea su propio contexto y **no ve las pestañas abiertas por el intent** `am start` (verificado:
`context.pages()` queda en `about:blank`). Como el prompt pide abrir la URL por intent (simula el escaneo del QR), se hace así:
1. `resetChrome()`: `pm clear`, permiso de notificaciones concedido (si no, Chrome 113 en Android 14 tapa la pantalla con su promo),
   flags en `/data/local/tmp/chrome-command-line` (`--ignore-certificate-errors`, sin FRE) y `am set-debug-app --persistent`.
   Es el mismo mecanismo que usa Playwright `_android` por dentro, y equivale a `ignoreHTTPSErrors: true`.
2. `am start -a android.intent.action.VIEW -d <url> com.android.chrome`.
3. `adb forward tcp:9333 localabstract:chrome_devtools_remote` + `chromium.connectOverCDP()` y se toma la pestaña de ese origen.
Sigue siendo Playwright sobre el Chrome real del emulador; CDP da además `Input.dispatchTouchEvent` para el multitouch.
También se activa `hide_error_dialogs` porque el emulador recién arrancado muestra "System UI isn't responding".
