# ADR-0002: Inyección de input con @jitsi/robotjs (en lugar del fork de nut.js)

## Estado
Aceptado — 2026-10-12

## Contexto
El prompt pide `@nut-tree-fork/nut-js` y, si no está mantenido, `@jitsi/robotjs`. Al 2026-10-12:
- `@nut-tree-fork/nut-js` 4.2.6: última publicación 2025-03-13 (19 meses sin releases).
- `@jitsi/robotjs` 0.6.24: publicado 2026-07, usado por Jitsi Meet Electron para control remoto.

Ambos son addons **N-API** con prebuilds (`prebuilds/win32-x64`), y N-API tiene ABI estable entre Node y Electron.

## Decisión
- Adapter `RobotJsInjector` detrás del puerto `InputInjector` (ADR-0005).
- **No** se usa `@electron/rebuild`: el binario N-API sirve tal cual. Solo hace falta `asarUnpack` para el paquete.
- Texto con `typeString` (unicode en Windows), así ñ/tildes/€ no dependen del layout de teclado.
- Los tests Android verifican posición con `robot.getMousePos()` (equivalente a `mouse.getPosition()` de nut.js).

## Alternativas
- nut-tree-fork: API más moderna (async), pero sin mantenimiento.
- nut.js oficial: pago.
- Addon propio con `SendInput`: más control, más mantenimiento; queda para el servicio nativo en Rust.

## Consecuencias
- robotjs es síncrono: el adapter lo envuelve en promesas y el `InputController` serializa.
- No inyecta en ventanas elevadas (UIPI). Se documenta; lo resuelve el servicio nativo futuro.
