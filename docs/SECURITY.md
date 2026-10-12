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
| Fuerza bruta de PIN | 5 fallos/IP → 5 min; 10 fallos totales → PIN nuevo; vence a 2 min; diálogo de aprobación | `main/auth/pin.ts` |
| Robo del token del QR | fragment `#t=` (no viaja en HTTP), un uso, 2 min, se borra del historial | `main/auth/token.ts`, client |
| Emparejamiento no autorizado | aprobación explícita en la PC (60 s, uno por vez) | `main/auth/approval.ts` |
| Replay de autenticación | nonce aleatorio de 32 B, un uso, 30 s; `timingSafeEqual` | `main/auth/challenge.ts` |
| Secreto expuesto en reposo | `safeStorage` (DPAPI) para secretos y claves privadas | `main/auth/deviceStore.ts`, `main/server/certs.ts` |
| CSWSH (otro sitio abre el WS) | `Origin` debe ser `https://<Host>`; además hace falta el secreto | `main/server/signaling.ts` |
| Input malformado / desbordes | zod strict en host y en main; clamp de coordenadas; límites de tamaño | `shared/protocol.ts`, `main/session/InputController.ts` |
| Flood de input | token bucket 500/s (ráfaga 100) → descarta y avisa | `InputController` |
| Teclas trabadas | registro de teclas/botones; `releaseAll` en heartbeat 3 s, cierre de canal, fin de sesión, crash del host | `InputController` |
| Ctrl+Alt+Supr / UAC | no se intenta (schema lo rechaza); requiere servicio nativo | fuera de alcance |
| Path traversal en archivos | nombre sanitizado (basename, sin reservados de Windows, sin controles), `wx` para no pisar | `main/files/sanitize.ts` |
| Renderer comprometido | sandbox, contextIsolation, CSP, sin navegación ni popups, IPC con validación de sender y schemas | `main/ipc/*` |
| Test mode en producción | eliminado en compilación + `!app.isPackaged` + script que falla si aparece | ADR-0008 |
| Sesión olvidada abierta | tray rojo, borde, notificación, atajo global de corte | `main/session/indicators.ts` |
| Logs con secretos | no se loguean token, PIN, nonce, secret ni HMAC | revisión |

## Límites conocidos
- Si el usuario acepta una advertencia de certificado distinta (MITM activo en la LAN) durante el emparejamiento,
  un atacante podría hacer de intermediario. Mitigación: instalar la CA local (ADR-0001) o emparejar solo en redes de confianza.
- No se puede controlar el escritorio seguro (UAC, login, Ctrl+Alt+Supr) ni ventanas elevadas.
- Contenido DRM se ve negro.

Revisiones de seguridad: ver la sección correspondiente en `docs/PROGRESS.md`.
