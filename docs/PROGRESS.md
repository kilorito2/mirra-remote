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
