# ADR-0008: REMOTE_TEST_MODE eliminado en compilación

## Estado
Aceptado — 2026-10-12

## Contexto
Los E2E necesitan aceptar loopback, autoaprobar y usar FakeInjector. Eso nunca puede quedar activo en producción.

## Decisión
- Constante de compilación `__KR_ALLOW_TEST_MODE__` (define de Vite): `true` en `npm run build`/`dev`, `false` en `build:prod`.
  Con `false`, el minificador elimina las ramas y el string `REMOTE_TEST_MODE` no aparece en el bundle.
- En runtime además se exige `!app.isPackaged`.
- `npm run dist` usa `build:prod` y `scripts/assert-no-test-mode.mjs` falla si encuentra el string en `out/`.

## Consecuencias
Dos builds. Los E2E usan el build de test; el instalador siempre el de producción.
