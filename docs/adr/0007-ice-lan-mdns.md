# ADR-0007: ICE en LAN sin STUN/TURN y candidatos mDNS

## Estado
Propuesto — se resuelve en la Fase 2 con evidencia

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
