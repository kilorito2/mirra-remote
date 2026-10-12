# Kilorito Remote — notas para agentes

- Leé `CONSTRAINTS.md` y nunca lo debilites para que un cambio pase.
- Spec: `docs/SPEC.md`; protocolo: `docs/PROTOCOL.md` (la fuente de verdad es `src/shared/protocol.ts`); ADRs en `docs/adr/`.
- Tareas: `tasks/todo.md`. Progreso: `docs/PROGRESS.md` (actualizar al cerrar cada fase; commit `feat(fase-N): ...`).
- Datos externos (WS, DataChannel, IPC, archivos, env) se validan con zod en el borde.
- `REMOTE_TEST_MODE` y `FakeInjector` solo existen con `__KR_ALLOW_TEST_MODE__` (ADR-0008).
- La suite Android mueve el mouse real: avisar por consola antes de correrla.
