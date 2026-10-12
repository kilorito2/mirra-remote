# ADR-0004: Tres DataChannels separados (input-fast, control, file)

## Estado
Aceptado — 2026-10-12

## Contexto
El movimiento del puntero es frecuente y efímero: una posición vieja no sirve. Clics, teclas y texto no pueden perderse
ni desordenarse. Los archivos son grandes y no deben bloquear el input (head-of-line blocking).

## Decisión
- `input-fast` (id 0): `ordered:false, maxRetransmits:0`. Solo `pointer.move` absoluto con `seq` (la PC descarta viejos) y `cursor.pos`.
- `control` (id 1): confiable y ordenado. Clics (con su propia coordenada), scroll, teclas, texto, heartbeat, comandos, portapapeles.
- `file` (id 2): confiable, con ack de aplicación y backpressure.
- `negotiated:true` con ids fijos: ambos lados los crean, sin carrera con `ondatachannel`.

## Consecuencias
Como cada clic trae coordenada, no importa si un `pointer.move` se pierde o llega tarde. SCTP multiplexa los streams:
un archivo grande no frena los clics.
