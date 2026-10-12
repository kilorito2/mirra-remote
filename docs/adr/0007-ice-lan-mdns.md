# ADR-0007: ICE en LAN sin STUN/TURN y candidatos mDNS

## Estado
Aceptado — 2026-10-12 (Fase 2)

## Contexto
Sin STUN/TURN, la conexión depende de candidatos host. Chromium oculta las IPs locales detrás de nombres `.local` (mDNS)
cuando la página no tiene permiso de cámara/micrófono. Si ambos lados publican solo `.local` y ninguno los resuelve, ICE falla.
Si un lado publica la IP real, el otro descubre al primero como candidato peer-reflexive y funciona.

## Decisión (provisoria)
`iceServers: []`. Probar primero sin tocar nada. Si el host Electron publica `.local` y no conecta (emulador, Tailscale),
aplicar `app.commandLine.appendSwitch('disable-features', 'WebRtcHideLocalIpsWithMdns')` en main. La PC ya expone su IP
en el QR, así que no se filtra nada nuevo.

## Consecuencias
Se actualiza a Aceptado con lo observado en la Fase 2.

## Evidencia (Fase 2)
- PC ↔ Chromium de Playwright en la misma máquina: conecta sin tocar nada.
- PC ↔ Chrome 113 del emulador (NAT del emulador + `adb reverse` solo para TCP): conecta sin tocar nada; el emulador
  descubre a la PC como candidato peer-reflexive. Codec negociado: H.264, 1366×768.
- Conclusión: **no** se aplica `WebRtcHideLocalIpsWithMdns`. Si en el checkpoint con Tailscale o un iPhone no conecta,
  el primer paso es activar ese switch en `main/index.ts` (solo afecta al renderer host).
