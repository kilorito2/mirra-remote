# Seguridad

## Modelo de amenazas

| Actor | Capacidad | Objetivo |
|---|---|---|
| Vecino en la misma WiFi | abre conexiones a la PC, prueba PINs, cambia de IP, sniffea | tomar control de la PC |
| Sitio web malicioso abierto en el celular | hace requests/WS cross-origin a la IP de la PC | usar la sesión del celular emparejado |
| Internet | — | no llega: solo IPs privadas/CGNAT, sin TURN |
| Dispositivo revocado / robado | tiene deviceId+secret viejos | volver a conectar |
| Proceso local sin privilegios | lee archivos de userData | robar secretos / clave de la CA |

## Controles

| Amenaza | Control | Dónde |
|---|---|---|
| Acceso desde fuera de la LAN | allowlist IP en `connection` TCP (antes del TLS) | `main/server/ipAllowlist.ts` |
| Fuerza bruta de PIN | 5 fallos por IP (/64 en IPv6) → 5 min; 20 intentos/min en total; 10 fallos → PIN nuevo; vence a 2 min; socket cerrado al fallar; diálogo de aprobación | `main/auth/pin.ts` |
| Robo del token del QR | fragment `#t=` (no viaja en HTTP), un uso, 2 min, se borra del historial | `main/auth/token.ts`, client |
| Emparejamiento no autorizado | aprobación explícita en la PC (60 s, uno por vez) | `main/auth/approval.ts` |
| Replay de autenticación | nonce aleatorio de 32 B, un uso, 30 s; `timingSafeEqual` | `main/auth/challenge.ts` |
| Secreto expuesto en reposo | `safeStorage` (DPAPI) para secretos y claves privadas | `main/auth/deviceStore.ts`, `main/server/certs.ts` |
| CSWSH (otro sitio abre el WS) | `Origin` debe ser `https://<Host>`; además hace falta el secreto | `main/server/signaling.ts` |
| DNS rebinding | `Host` solo IP literal o `localhost`; además el certificado no coincide con el dominio del atacante | `isIpOrLocalhostHost` |
| Agotamiento de conexiones | máx. 16 WS sin autenticar; 15 s para autenticar (salvo esperando aprobación); `maxPayload` 64 KiB, sin deflate | `signaling.ts` |
| Input malformado / desbordes | zod strict en host y en main; clamp de coordenadas; límites de tamaño | `shared/protocol.ts`, `main/session/InputController.ts` |
| Flood de input | token bucket 500/s (ráfaga 100) → descarta y avisa | `InputController` |
| Teclas trabadas | registro de teclas/botones; `releaseAll` en heartbeat 3 s, cierre de canal, fin de sesión, crash del host | `InputController` |
| Ctrl+Alt+Supr / UAC | no se intenta (schema lo rechaza); requiere servicio nativo | fuera de alcance |
| Path traversal en archivos | nombre sanitizado (basename, sin reservados de Windows, sin controles), `wx` para no pisar | `main/files/sanitize.ts` |
| Renderer comprometido | sandbox, contextIsolation, CSP, sin navegación ni popups, IPC con validación de sender y schemas | `main/ipc/*` |
| Test mode en producción | eliminado en compilación + `!app.isPackaged` + script que falla si aparece | ADR-0008 |
| Sesión olvidada abierta | tray rojo, borde, notificación, atajo global de corte | `main/session/indicators.ts` |
| Logs con secretos | no se loguean token, PIN, nonce, secret ni HMAC | revisión |

## Credenciales en el celular
El `deviceId` va en localStorage; el secreto se guarda como `CryptoKey` HMAC **no exportable** en IndexedDB (ADR-0009):
un script en el origen puede firmar mientras esté, pero no llevarse el secreto. Además: CSP `script-src 'self'`, sin
scripts de terceros, sin `innerHTML`; revocar desde la PC invalida el secreto.

## Límites conocidos
- MITM en la LAN: si el usuario acepta la advertencia de un certificado ajeno (en cualquier conexión, no solo al emparejar),
  el atacante puede hacer de intermediario mientras dure el ataque (usar la clave, no extraerla). La PC avisa si el dispositivo
  reaparece desde otra IP. La defensa completa es instalar la CA local comparando la huella (ADR-0001).
- `safeStorage` (DPAPI) protege de otros usuarios de Windows, no de procesos del mismo usuario.
- Tailscale: `100.64.0.0/10` se acepta en cualquier interfaz (es CGNAT; en una LAN normal no aparece).
- No se puede controlar el escritorio seguro (UAC, login, Ctrl+Alt+Supr) ni ventanas elevadas.
- Contenido DRM se ve negro.

## Auditoría adversarial (Fase 5, 2026-10-12)
Un auditor con contexto fresco atacó emparejamiento y protocolo. Hallazgos y estado:

| Id | Sev. | Hallazgo | Estado |
|---|---|---|---|
| A1 | Alto | PIN por fuerza bruta rotando IPv6 (bloqueo por IP exacta; PIN siempre activo) | **Corregido**: bloqueo por /64, límite global 20 intentos/min, el socket se cierra al primer PIN inválido, el diálogo dice si vino por PIN o QR |
| A2 | Alto | MITM roba el secreto de localStorage en cualquier reconexión | **Mitigado**: clave no exportable (ADR-0009) + aviso de reconexión desde otra IP; defensa total = CA instalada |
| M1 | Medio | `/ca.crt` por canal no autenticado | **Mitigado**: la UI pide comparar la huella SHA-256 antes de confiar |
| M2 | Medio | DoS con 16 sockets sin autenticar | **Corregido**: 4 por origen (/64), cierre a los 5 s sin primer mensaje, se expulsa la más vieja en lugar de rechazar |
| M3 | Medio | Atacante deja el PIN inutilizable | **Aceptado**: el límite global puede bloquear el PIN un minuto; el QR sigue funcionando |
| B1 | Bajo | Comandos sin rate limit | **Corregido**: 10/s (ráfaga 20) |
| B2 | Bajo | Listeners acumulados y ack de lo recibido | **Corregido**: listeners se quitan; ack de lo escrito en disco |
| B3 | Bajo | Carreras al terminar un archivo | **Corregido**: se verifica la transferencia tras cada await; movida exclusiva (`link`) sin pisar |
| B4 | Bajo | Archivos sin Mark-of-the-Web; `desktop.ini`/`.library-ms` | **Corregido**: `Zone.Identifier` ZoneId=3; extensiones peligrosas quedan `.bloqueado` |
| B5 | Bajo | Disco lleno / `.part` huérfanos | **Corregido**: chequeo de espacio libre (+256 MiB) y limpieza al arrancar |
| B6 | Bajo | Atajo de corte tomado por otro programa | **Corregido**: aviso visible en la ventana |
| B7 | Bajo | Sin Electron fuses | **Corregido**: RunAsNode, NODE_OPTIONS e inspector off; integridad del asar; solo carga desde asar |
| B8 | Bajo | Input encolado inyectado tras `stop()` | **Corregido** |
| Info | — | SAS con teclas sueltas, `CONIN$`/`CONOUT$`, SDP en logs, `isClosed` tras el HMAC | **Corregidos** |

## Revisiones
- 2026-10-12, cierre Fase 1: timeout de aprobación, tope de conexiones, Host IP-only. Ver PROGRESS.md.
- 2026-10-12, cierre Fase 5: auditoría adversarial (tabla de arriba).
