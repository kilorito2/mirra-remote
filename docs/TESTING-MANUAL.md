# Checklist manual (CHECKPOINT FINAL)

Lo que los tests automáticos no pueden medir: fluidez real en WiFi, dedos de verdad, Safari iOS, multi-monitor.
Anotá ✅ / ❌ y, si algo falla, qué hiciste justo antes.

## 0. Instalación
- [ ] Instalar `release/Kilorito Remote Setup 0.1.0.exe`. Windows SmartScreen puede avisar (el instalador no está firmado con un certificado comercial): "Más información › Ejecutar de todas formas".
- [ ] Al abrir, Windows pide permiso de red: marcar **solo Redes privadas**.
- [ ] La app queda en la bandeja (ojo amarillo). Cerrar la ventana no la cierra; "Salir" desde el menú del tray sí.

## 1. Emparejar (Chrome Android)
- [ ] Celular en la **misma WiFi** (5 GHz si es posible).
- [ ] Escanear el QR con la cámara. Chrome muestra "La conexión no es privada": **Configuración avanzada › Acceder (no seguro)**. Es esperable (certificado propio de la PC).
- [ ] En la PC aparece "¿Permitir que … controle esta PC?" → **Permitir**.
- [ ] La barra de direcciones ya **no** muestra `#t=…`.
- [ ] Tray en rojo, borde rojo alrededor de la pantalla, notificación de Windows.
- [ ] El borde **no** se ve en el video del celular.
- [ ] Probar también por PIN: abrir `https://<ip>:47800` a mano y escribir el PIN de la PC.

## 2. Fluidez (criterio de aceptación)
- [ ] Más opciones › Estadísticas: **1080p (o la resolución de tu monitor), ≥ 30 fps, RTT < 30 ms** en WiFi 5 GHz.
- [ ] Codec: debería decir H264.
- [ ] Mover una ventana o un video en la PC: se ve fluido en el celular.
- [ ] Calidad: Nítido / Fluido / Ahorro cambian en vivo sin cortar.

## 3. Gestos con dedos de verdad
- [ ] Trackpad: arrastrar un dedo mueve el cursor; lento = preciso, rápido = cruza la pantalla.
- [ ] Tap = clic; doble tap = doble clic (abrir una carpeta del escritorio).
- [ ] Tap con 2 dedos = clic derecho (menú contextual).
- [ ] Arrastrar 2 dedos = scroll en un navegador o documento.
- [ ] Mantener y arrastrar = mover una ventana / seleccionar texto.
- [ ] Pellizcar = zoom del video (la PC no cambia); con zoom, la vista sigue al cursor.
- [ ] Modo táctil directo (ícono de la mano): el clic cae donde tocás.
- [ ] El navegador no hace zoom, ni scroll, ni "tirar para recargar".

## 4. Teclado
- [ ] Botón Teclado: se abre el teclado del celular.
- [ ] Escribir en el Bloc de notas: **ñ, á é í ó ú, @, €**, emoji; backspace; Enter.
- [ ] Teclas especiales: Esc, Tab, flechas, F5, Alt+Tab, Win+D, Ctrl+C / Ctrl+V.
- [ ] Ctrl "pegado" + letra del teclado del celular = combinación (ej. Ctrl + a).
- [ ] Win+L pide confirmación. Ctrl+Alt+Supr explica que requiere el servicio nativo.

## 5. Teclas trabadas (criterio de aceptación)
- [ ] Con Ctrl pegado o arrastrando, **apagar el WiFi del celular**: en la PC no queda Ctrl ni el botón apretado (probá tipear en la PC).
- [ ] Lo mismo bloqueando el celular y cerrando la pestaña.

## 6. Reconexión (criterio de aceptación)
- [ ] Apagar y prender el WiFi del celular: vuelve solo, sin volver a aprobar.
- [ ] Bloquear el celular 30 s y desbloquear: vuelve solo.
- [ ] Ctrl+Alt+Shift+K en la PC: corta al instante; el celular dice "Alguien cortó la sesión desde la PC".

## 7. Extras
- [ ] Audio: arranca en silencio; el botón del parlante lo activa.
- [ ] Portapapeles: "Mandar a la PC" y "Traer de la PC".
- [ ] Archivo del celular a la PC: aparece en **Descargas › Kilorito Remote**.
- [ ] Archivo de la PC al celular: "Enviar al celular" o soltarlo en la ventana; se descarga en el celular. Probar cancelar.
- [ ] Pantalla completa (Android) y orientación horizontal.
- [ ] Multi-monitor (si tenés dos): Más opciones › Pantalla; el cambio es instantáneo y el borde rojo se mueve.
- [ ] La pantalla del celular no se apaga sola durante la sesión.

## 8. Seguridad
- [ ] Revocar el celular desde la PC: se corta y, al reabrir, pide emparejar de nuevo.
- [ ] Un segundo celular mientras hay sesión: "La PC está ocupada".
- [ ] Rechazar el diálogo de aprobación: el celular dice "La PC rechazó la conexión".

## 9. Safari iOS (si tenés iPhone)
- [ ] Mismos pasos 1–7. Safari muestra "Esta conexión no es privada": **Mostrar detalles › visitar este sitio web**.
- [ ] Teclado: el input se abre al tocar el botón (iOS exige el toque).
- [ ] Audio: se activa con el botón.
- [ ] PWA: Compartir › Agregar a inicio y abrirla desde ahí (pantalla completa).
  - Si la PWA no abre por el certificado: en la PC, "Sacar la advertencia de seguridad del celular" e instalar la CA (perfil + Ajustes › General › Información › Confianza de certificados).
- [ ] Tailscale (opcional): elegir la IP 100.x en la PC y conectar desde fuera de casa con Tailscale activo.

## Si algo falla
- Imagen negra o que no llega: en la PC, desactivar "Codificación por hardware" (reinicia la app).
- No conecta por Tailscale: anotarlo (ver ADR-0007, plan B de mDNS).
- Contenido con DRM (Netflix en el navegador) se ve negro: es esperado.
