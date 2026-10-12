# Arquitectura

## Vista general

```mermaid
flowchart LR
  subgraph Phone["Celular (Chrome Android / Safari iOS)"]
    C[Web app PWA<br/>client/]
  end
  subgraph PC["PC Windows — Electron"]
    M[Main process<br/>server HTTPS+WSS, auth, sesión,<br/>InputController, tray, overlay]
    H[Renderer host<br/>oculto, backgroundThrottling:false<br/>RTCPeerConnection + DataChannels]
    U[Renderer UI<br/>QR, PIN, estado, ajustes]
    I[(InputInjector<br/>RobotJs / Fake)]
    S[(ScreenSource<br/>desktopCapturer)]
  end
  C <-- "WSS: signaling + auth" --> M
  C <-- "WebRTC: video, audio, DataChannels" --> H
  H -- "IPC (validado)" --> M
  M -- "IPC estado" --> U
  M --> I
  M --> S
```

## Responsabilidades

| Proceso | Hace | No hace |
|---|---|---|
| **Main** | ciclo de vida, tray, server HTTPS/WSS, allowlist IP, certificados, pairing/auth, devices, `setDisplayMediaRequestHandler`, `InputController` (rate limit, watchdog, releaseAll), overlay, atajo global, archivos en disco, portapapeles | WebRTC |
| **Renderer host** | `getDisplayMedia()`, RTCPeerConnection (ofertante), codecs, presets, `replaceTrack`, DataChannels, ICE restart, stats; reenvía input validado a main | tocar disco, inyectar input |
| **Renderer UI** | mostrar estado, QR/PIN, dispositivos, ajustes, enviar archivos (drag&drop) | lógica de seguridad |
| **Client (celular)** | pairing/auth, reconocedor de gestos, teclado, barra de teclas, zoom local, portapapeles, archivos, stats overlay, Wake Lock | — |
| **shared/** | `protocol.ts` (schemas zod), `coords.ts`, `constants.ts`, helpers puros (rate limit, base64url) | dependencias de Node o DOM |

## Arquitectura hexagonal (ADR-0005)

```mermaid
flowchart TB
  subgraph Core["Núcleo (main/session, main/auth)"]
    IC[InputController]
    SM[SessionManager]
  end
  subgraph Ports
    P1[[InputInjector]]
    P2[[ScreenSource]]
  end
  subgraph Adapters
    A1[RobotJsInjector]
    A2[FakeInjector — tests]
    A3[ElectronScreenSource]
    A4[(futuro) NativeServiceInjector — Rust/SYSTEM]
  end
  IC --> P1
  SM --> P2
  A1 -.implementa.-> P1
  A2 -.implementa.-> P1
  A4 -.implementa.-> P1
  A3 -.implementa.-> P2
```

```ts
// src/main/ports/InputInjector.ts
export interface InputInjector {
  moveTo(p: ScreenPoint): Promise<void>;             // píxeles físicos
  button(b: MouseButton, action: 'down' | 'up'): Promise<void>;
  scroll(dx: number, dy: number): Promise<void>;      // unidades WHEEL_DELTA (120 = 1 muesca)
  key(k: KeyName, action: 'down' | 'up'): Promise<void>;
  typeText(text: string): Promise<void>;              // unicode, sin dejar teclas apretadas
  cursorPosition(): Promise<ScreenPoint>;
  releaseAll(): Promise<void>;                        // idempotente
}

// src/main/ports/ScreenSource.ts
export interface ScreenSource {
  listDisplays(): DisplayInfo[];                      // id, label, rect físico, scaleFactor, primary
  captureSourceFor(displayId: string): Promise<CaptureSource>; // id de desktopCapturer
  onDisplaysChanged(cb: () => void): () => void;
}
```

`InputController` (núcleo) es el único que habla con `InputInjector`: lleva el registro de teclas/botones apretados,
aplica clamp, rate limit (token bucket 500/s, ráfaga 100) y el watchdog de heartbeat (3 s ⇒ `releaseAll`).

## Flujos

### Emparejamiento por QR

```mermaid
sequenceDiagram
  participant P as Celular
  participant M as Main
  participant U as Usuario en la PC
  P->>M: GET https://ip:47800/ (allowlist IP en TCP)
  Note over P: lee #t=token y lo borra con history.replaceState
  P->>M: WSS /ws (Origin == Host)
  P->>M: pair.token {token, deviceName}
  M->>M: token válido, no usado, no vencido → se consume
  M->>U: "¿Permitir que <dispositivo> controle esta PC?"
  M-->>P: pair.pending
  U->>M: Aceptar
  M->>M: deviceId + deviceSecret, secreto cifrado con safeStorage
  M-->>P: pair.approved {deviceId, deviceSecret}
  M-->>P: auth.ok {host, displays}
  Note over P: guarda credenciales en localStorage
```

### Reconexión (challenge-response)

```mermaid
sequenceDiagram
  participant P as Celular
  participant M as Main
  P->>M: auth.hello {deviceId}
  M-->>P: auth.challenge {nonce (32 B)}
  P->>P: HMAC-SHA256(secret, "kr-auth-v1:"+nonce) con crypto.subtle
  P->>M: auth.response {hmac}
  M->>M: timingSafeEqual, nonce de un uso (vence a 30 s)
  M-->>P: auth.ok  (o error AUTH_FAILED / REVOKED / BUSY)
```

### Sesión WebRTC

```mermaid
sequenceDiagram
  participant P as Celular
  participant M as Main
  participant H as Renderer host
  M->>H: IPC session.start {displayId, preset, audio}
  H->>M: IPC getDisplayMedia → handler → {video: source, audio: 'loopback'}
  H->>H: addTransceiver(sendonly), setCodecPreferences(H264, VP8), DataChannels negociados (id 0,1,2)
  H->>M: rtc.description (offer)
  M->>P: rtc.description (offer)
  P->>M: rtc.description (answer)
  M->>H: answer
  H-->>P: ICE directo (host candidates, sin STUN/TURN)
  P->>H: input-fast / control / file
  H->>M: IPC host:input (zod) → InputController → InputInjector
```

### Corte de sesión
Cualquiera de: Ctrl+Alt+Shift+K, botón en tray/UI, revocar, `session.end` del celular, WS cerrado más de 15 s sin reanudar,
heartbeat ausente 3 s (solo suelta input), DataChannel `control` cerrado. Siempre: `releaseAll()` → cerrar PeerConnection →
tray normal → overlay oculto.

## Coordenadas

```mermaid
flowchart LR
  A["toque (px CSS de la superficie)"] --> B["frame normalizado [0,1]<br/>(contain + zoom/paneo locales)<br/>client/surface.ts"]
  B --> C["píxel físico del display elegido<br/>shared/coords.ts: rect físico + clamp"]
  C --> D["InputInjector.moveTo"]
```

Main calcula el rect físico de cada display una vez (`screen.dipToScreenRect(null, display.bounds)` en Windows) y lo
pasa a `coords.ts`, que es puro. La inversa (cursor físico → normalizado) alimenta `cursor.pos` hacia el celular
para que el zoom siga al cursor y el trackpad se sincronice.

## Procesos y ventanas

| Ventana | Preload | Notas |
|---|---|---|
| UI (`index.html`) | `ui.ts` | 420×760, sin menú, se oculta al tray al cerrar |
| Host (`host.html`) | `host.ts` | `show:false`, `backgroundThrottling:false` |
| Overlay (una por display capturado) | ninguno | transparente, always-on-top `screen-saver`, `setIgnoreMouseEvents(true)`, `setContentProtection(true)` |
| Test textarea | ninguno | solo `REMOTE_TEST_MODE`, para E2E de teclado |

Todas: `contextIsolation`, `sandbox`, `nodeIntegration:false`, CSP estricta, `setWindowOpenHandler(() => ({action:'deny'}))`,
`will-navigate` bloqueado. Cada handler IPC verifica que `event.sender` sea la ventana esperada.
