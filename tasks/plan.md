# Implementation Plan: Kilorito Remote

## Overview
App Electron para Windows que transmite pantalla+audio por WebRTC a una web móvil servida por la misma app, y recibe
mouse/teclado. Spec: `docs/SPEC.md`. Protocolo: `docs/PROTOCOL.md`. Arquitectura: `docs/ARCHITECTURE.md`.
Modo de trabajo: autónomo fase por fase (sin gates humanos salvo el CHECKPOINT FINAL). Tareas en `tasks/todo.md`.

## Decisiones
- CA local + certificado de servidor (ADR-0001), robotjs sin rebuild (ADR-0002), H.264 (ADR-0003),
  3 DataChannels negociados (ADR-0004), hexagonal (ADR-0005), emulador Android + WebKit sin WebRTC (ADR-0006),
  ICE sin STUN y mDNS a evaluar (ADR-0007), test mode eliminado en compilación (ADR-0008).
- Todo input es absoluto normalizado: el trackpad mantiene un cursor virtual en el celular (resync con `cursor.pos`).
- La PC (renderer host) es siempre la ofertante; el celular contesta y pide `rtc.restart`.

## Grafo de dependencias

```
shared (protocol, coords, constants)
  ├── main/server (certs, https, allowlist, static)
  │     └── main/auth (token, pin, devices, hmac) ── main/signaling (WS state machine)
  │            └── ui renderer (QR, PIN, devices) / client pairing screens
  │                   └── host renderer (capture + RTCPeerConnection)  ← Fase 2
  │                          └── main/session/InputController + ports/adapters ← Fase 3
  │                                 └── client gestures / keyboard
  │                                        └── extras (clipboard, files, audio, stats) ← Fase 4
  └── tests/android (setup + skeleton en Fase 1, crece en cada fase)
```

## Fases y checkpoints
| Fase | Resultado verificable | Cierre |
|---|---|---|
| 1 | Celular se empareja (QR/PIN), aprueba, reconecta por challenge; no emparejado rechazado; indicadores y atajo | unit + E2E desktop + Android pairing; security review |
| 2 | Video en el celular con H.264/VP8, presets, ICE restart | Android: `videoWidth>0`, `framesDecoded` sube, screencap |
| 3 | Mouse, gestos, scroll, teclado, teclas especiales, releaseAll | Android con robotjs real |
| 4 | Audio, portapapeles, archivos, multi-monitor, stats, reconexión | Android: clipboard, archivo, wifi off/on |
| 5 | Hardening, instalador NSIS, README, TESTING-MANUAL | todo verde + bounty hunt |

Riesgo alto primero: en la Fase 1 se levanta el emulador y se prueba la conexión HTTPS/WSS desde Chrome Android,
así cualquier problema de entorno aparece antes de construir video.

## Riesgos
| Riesgo | Impacto | Mitigación |
|---|---|---|
| Playwright `_android` no maneja el Chrome de la imagen google_apis | Alto | Imagen con root; si falta Chrome, instalar APK de Chrome for Testing; si no, CDP vía `adb forward` |
| ICE no conecta emulador↔host (NAT + mDNS) | Alto | ADR-0007 (desactivar mDNS en host); `adb reverse` solo cubre TCP, el UDP sale por la NAT del emulador hacia la IP LAN del host |
| Electron no ofrece H.264 en `getCapabilities` | Medio | Fallback VP8 ya previsto |
| `getDisplayMedia` en ventana oculta se throttlea | Medio | `backgroundThrottling:false`, `show:false`; si hace falta, ventana 1×1 offscreen |
| robotjs y escalado mixto | Medio | rect físico por `dipToScreenRect`; tests con 100/125/150 % |
| Teclados móviles (229/composición) | Medio | diff de texto puro y testeado; prueba en emulador con Gboard |
| iOS PWA con certificado no confiable | Medio | CA local opcional (ADR-0001); validar en checkpoint |
| Mover el mouse real en tests | Bajo | Aviso por consola + FakeInjector en desktop E2E |

## Preguntas abiertas
Ninguna bloqueante.
