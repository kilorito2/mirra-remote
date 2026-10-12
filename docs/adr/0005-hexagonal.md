# ADR-0005: Arquitectura hexagonal para input y captura

## Estado
Aceptado — 2026-10-12

## Contexto
El input y la captura dependen de APIs del SO. Necesitamos tests sin mover el mouse real (FakeInjector) y poder
enchufar más adelante un servicio nativo de Windows en Rust (SYSTEM, para UAC/login/SendSAS) sin tocar el resto.

## Decisión
Puertos en `src/main/ports/`: `InputInjector` y `ScreenSource`. Adapters en `src/main/adapters/`:
`RobotJsInjector`, `FakeInjector` (graba acciones; solo test mode), `ElectronScreenSource`.
El núcleo (`InputController`, `SessionManager`) recibe los puertos por constructor. El adapter se elige en
`main/index.ts` (composición): `KR_INJECTOR=fake` solo se respeta con `REMOTE_TEST_MODE`.

## Consecuencias
- La lógica de seguridad (clamp, rate limit, watchdog, releaseAll) vive en el núcleo y se testea con FakeInjector.
- Un `NativeServiceInjector` futuro implementa el mismo puerto (IPC por named pipe al servicio).
