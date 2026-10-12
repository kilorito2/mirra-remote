# Constraints

Barra de calidad del proyecto. **No se baja para que algo pase**: si un check falla, se arregla el código o se discute el
check con el usuario y se registra la excepción abajo.

## Floor (bloquea el commit de fase)
| Regla | Comando | Motivo |
|---|---|---|
| Typecheck strict sin errores | `npm run typecheck` | criterio de aceptación del proyecto |
| Lint sin errores ni warnings | `npm run lint` | incluye `no-explicit-any`, `ban-ts-comment`, `no-floating-promises` |
| Sin `any` | regla `@typescript-eslint/no-explicit-any: error` | criterio de aceptación |
| Unit + componentes verdes | `npm test` | |
| E2E desktop verdes | `npm run test:e2e` | |
| Android verde al cierre de fase 1–5 | `npm run test:android` | |
| Sin tests saltados sin motivo | `test.skip` solo con razón en el mensaje (ej. WebKit sin WebRTC) | evitar verde falso |
| Sin test mode en producción | `node scripts/assert-no-test-mode.mjs` (en `npm run dist`) | ADR-0008 |

## Seguridad
| Regla | Comando |
|---|---|
| Dependencias de producción sin vulnerabilidades altas/críticas | `npm audit --omit=dev --audit-level=high` |
| Revisión de seguridad al cerrar Fase 1 y Fase 5 | skill `security-review` + agente `agent-skills:security-auditor` |

## Cobertura (medida, no bloqueante salvo módulos críticos)
Módulos críticos con ≥ 90 % de líneas: `src/main/auth/**`, `src/main/server/ipAllowlist.ts`, `src/main/session/InputController.ts`,
`src/shared/**`, `client/src/input/gestures.ts`. Comando: `npm run test:coverage`. Motivo: es donde un bug es una vulnerabilidad o una tecla trabada.

## Ubicación de los checks
- Edición: `npm run typecheck`, `npm run lint` (segundos).
- Fin de tarea: `npm test` (< 30 s).
- Fin de fase: `npm run test:e2e`, `npm run test:android`, audit.

## Excepciones
| Regla | Excepción | Dueño | Vence |
|---|---|---|---|
| Android verde | Safari iOS no se puede automatizar en Windows: se valida en checkpoint manual | usuario | checkpoint final |
| E2E WebKit | sin WebRTC en WebKit de Windows (ADR-0006) | — | permanente |
