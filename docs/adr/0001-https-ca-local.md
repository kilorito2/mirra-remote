# ADR-0001: HTTPS con CA local autogenerada (instalación opcional en el celular)

## Estado
Aceptado — 2026-10-12

## Contexto
El celular necesita contexto seguro: `crypto.subtle` (HMAC del challenge), `navigator.clipboard` y Wake Lock solo existen en HTTPS.
No hay dominio público ni internet: la PC se accede por IP de LAN o Tailscale. Un certificado autofirmado obliga a aceptar
una advertencia, que Chrome no recuerda para siempre. Además, con un certificado inválido no hay Service Worker
(no se puede instalar la PWA de verdad en Android), y en iOS la PWA abierta desde la pantalla de inicio puede no heredar la excepción.

## Decisión
- En el primer arranque se genera una **CA local** (RSA 2048, SHA-256, 10 años, `basicConstraints CA:true`,
  **Name Constraints** que solo permiten IPs privadas/CGNAT/loopback y `localhost`) y un certificado de servidor
  firmado por ella (SAN con todas las IPs locales + hostname, EKU serverAuth, ≤ 825 días por la regla de Apple).
- Ambos se guardan en `userData/certs/`; las claves privadas cifradas con `safeStorage`.
- Si cambian las IPs y alguna no está en el SAN, se regenera **solo** el certificado de servidor (la CA no cambia).
- Por defecto el usuario acepta la advertencia del navegador (funciona igual). Opcionalmente descarga `/ca.crt` y la instala
  (iOS: perfil + "Ajustes > General > Información > Confianza de certificados"; Android: "Certificado de CA").
  Con la CA instalada desaparece la advertencia y funcionan PWA/SW.
- El token del QR va en el fragment (`#t=`), que nunca se manda en un request HTTP.

## Alternativas
- **Solo autofirmado:** más simple; iOS PWA frágil y advertencias recurrentes. Rechazado por el usuario.
- **`tailscale cert` (Let's Encrypt en *.ts.net):** certificado válido sin instalar nada, pero solo sirve por Tailscale. Queda como mejora futura.
- **HTTP plano:** no hay `crypto.subtle` ni clipboard. Descartado.

## Consecuencias
- La clave de la CA es sensible: si se roba y el celular confía en la CA, se podrían falsificar certificados. Lo mitigan
  las Name Constraints (solo IPs privadas) y el cifrado con DPAPI (`safeStorage`).
- Documentar en TESTING-MANUAL: aceptar la advertencia (o instalar la CA) la primera vez por IP.
