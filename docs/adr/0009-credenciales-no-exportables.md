# ADR-0009: El secreto del dispositivo como CryptoKey no exportable (en vez de localStorage)

## Estado
Aceptado — 2026-10-12 (Fase 5, auditoría de seguridad)

## Contexto
El prompt pedía guardar `deviceId + deviceSecret` en localStorage. La auditoría (hallazgo A2) mostró que, si el usuario
acepta el certificado de un atacante en la LAN (ARP spoofing + certificado autofirmado, que se parece a la advertencia
"normal" de la app), el JS del atacante corre en el mismo origen `https://IP:puerto`, lee localStorage y se lleva el secreto:
después entra a la PC cuando quiera, sin aprobación.

## Decisión
- Al emparejar, el secreto se importa con `crypto.subtle.importKey(..., extractable: false, ['sign'])` y la `CryptoKey`
  se guarda en IndexedDB (que permite guardar CryptoKey). En localStorage queda solo el `deviceId`.
- El challenge se firma con esa clave; el secreto en claro no se guarda en ningún lado del celular.
- Las credenciales del formato viejo se migran solas al cargar.
- Sin IndexedDB (modo privado restringido) la clave vive solo en memoria: hay que emparejar en cada visita.

## Consecuencias
- Un atacante con MITM activo todavía puede **usar** la clave mientras dure el ataque y el celular esté conectado, pero no
  puede **extraerla** para entrar después. Además la PC avisa si el dispositivo reaparece desde otra IP.
- La defensa completa contra MITM es instalar la CA local (ADR-0001); la UI explica cómo comparar la huella.
