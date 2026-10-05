<p align="center">
  <a href="https://takaoumehara.github.io/snap-pair-skill/"><strong>📖 Sitio de documentación →  takaoumehara.github.io/snap-pair-skill</strong></a>
  &nbsp;·&nbsp;
  <a href="https://takaoumehara.github.io/snap-pair-skill/demo.html">▶ Demo en vivo con dos pestañas</a>
</p>

<p align="center">
  <a href="https://takaoumehara.github.io/snap-pair-skill/"><img src="./docs/assets/hero.svg" alt="snap-pair: el teléfono como mando y la pantalla grande como anfitrión. Empareja con QR, PIN de 6 dígitos o broadcast; transmite por Firebase, PartyKit, WebRTC o BroadcastChannel." width="100%"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/snap-pair-core"><img src="https://img.shields.io/badge/npm-snap--pair--core-cb3837?logo=npm" alt="npm: snap-pair-core"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT">
  <img src="https://img.shields.io/badge/React-18%2B-61dafb?logo=react&logoColor=white" alt="React 18+">
  <img src="https://img.shields.io/badge/TypeScript-ready-3178c6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/transports-4-4f46e5" alt="4 transports">
  <img src="https://img.shields.io/badge/UX%20presets-7-0d9488" alt="7 UX presets">
</p>

<p align="center">
  <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.md">English</a> · <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.ja.md">日本語</a> · <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.zh-CN.md">简体中文</a> · <b>Español</b> · <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.ko.md">한국어</a>
</p>

# snap-pair

**snap-pair es una DevTool para crear experiencias web interactivas multipantalla.**
El teléfono se convierte en el mando y la pantalla grande en el anfitrión. Las personas se emparejan escaneando un código QR o escribiendo un PIN de 6 dígitos en su navegador habitual, sin instalar nada, y todos los dispositivos de la sala comparten entradas y estado en vivo.

Tú aportas el producto (una trivia, un muro de dibujo, un juego, un espectáculo de luces, una sala de exposición) y lo construyes encima. snap-pair se encarga del emparejamiento, del transporte en tiempo real y de los detalles del lado del teléfono que es fácil hacer mal.

- **Emparejamiento:** código QR, PIN de 6 dígitos o broadcast local entre pestañas.
- **Transporte:** Firebase Realtime Database, PartyKit, WebRTC DataChannel o BroadcastChannel, todos detrás de una misma API `Transport`.
- **Utilidades de cliente:** bloqueo de pantalla activa (wake lock), orientación y movimiento del dispositivo (incluido el aviso de permisos de iOS) y bloqueo de la orientación de pantalla.
- **7 presets de UX** y una CLI (`npx snap-pair init`) que genera una app funcional.

El paquete de npm es **`snap-pair-core`** (MIT).

> La referencia completa de la API, las preguntas frecuentes y la hoja de ruta están en el [README en inglés](https://github.com/takaoumehara/snap-pair-skill/blob/main/README.md#api-overview) y en el [sitio de documentación](https://takaoumehara.github.io/snap-pair-skill/).

---

## Inicio rápido

```bash
# 1. Scaffold a new app with the interactive wizard (en/ja)
npx snap-pair init

#    …or non-interactively (CI, AI agents)
npx snap-pair init --yes --preset room-quiz-poll --out my-quiz

# 2. Or add the library to an existing React app
npm i snap-pair-core
```

<details>
<summary>pnpm / yarn / bun</summary>

```bash
pnpm add snap-pair-core
yarn add snap-pair-core
bun add snap-pair-core
```

</details>

Dependencias peer: `react` (18.2+). Opcionales: `qrcode` (renderizado de QR en `HostHUD`), `partysocket` (un socket de PartyKit más robusto) y `react-dom` (solo lo usan las plantillas generadas).

La app multipantalla más pequeña posible no necesita ningún servidor. Empareja dos pestañas del mismo navegador con un PIN:

```ts
import { BroadcastChannelTransport } from 'snap-pair-core';

// Tab 1: the host (big screen)
const host = new BroadcastChannelTransport({ pairing: 'pin' });
await host.connect();
const { pairing } = await host.createRoom({ initialState: { strokes: [] } });
console.log('PIN', pairing.pin); // e.g. '042917'
host.onMessage((m) => draw(m.payload)); // m.type === 'stroke'

// Tab 2: the controller
const ctrl = new BroadcastChannelTransport({ pairing: 'pin' });
await ctrl.connect();
await ctrl.joinRoom('042917');
await ctrl.broadcast('stroke', { x: 0.42, y: 0.17 });
```

Cambia `BroadcastChannelTransport` por `PartyKitTransport` (o `WebRTCTransport`) y el mismo código funciona a través de internet. `FirebaseTransport` comparte el estado de la sala pero no tiene mensajería efímera, así que `broadcast` no está disponible ahí (consulta [Transportes](#transportes-y-cuándo-usar-cada-uno)).
[Pruébalo en vivo en dos pestañas →](https://takaoumehara.github.io/snap-pair-skill/demo.html)

---

## Cómo se conectan los dispositivos

<p align="center">
  <img src="./docs/assets/pairing-flow.svg" alt="Flujo de emparejamiento: el anfitrión crea la sala y muestra el QR y el PIN, el mando escanea o introduce el PIN, se une, el anfitrión lo admite y los mensajes en tiempo real fluyen en ambos sentidos." width="100%">
</p>

| Método | Qué hace el invitado | Funciona con | Helpers |
|---|---|---|---|
| **Código QR** | Lo escanea con la cámara; la URL lleva `?room=` o `?pin=` | Todos los transportes | `buildPairingJoinUrl`, `parseJoinUrl`, `useQrRenderer`, `HostHUD` |
| **PIN de 6 dígitos** | Escribe `042 917` (los dígitos de ancho completo y los guiones se normalizan) | PartyKit, WebRTC, BroadcastChannel | `generatePin`, `normalizePin`, `isValidPin`, `verifyPin` |
| **Código de sala** | Escribe un código de 6 caracteres como `ABC 234` (sin caracteres que se confundan) | Todos los transportes (el predeterminado de Firebase) | `normalizeRoomCode`, `generateRoomCode` |
| **Broadcast** | Abre otra pestaña/ventana en la misma máquina | BroadcastChannel | `BroadcastChannelTransport` |

El anfitrión lo muestra todo con un solo componente:

```tsx
import { HostHUD, useQrRenderer } from 'snap-pair-core';

const renderQr = useQrRenderer(); // undefined if `qrcode` isn't available, so the HUD shows the code only
<HostHUD pairing={pairing} renderQr={renderQr} peerCount={peers.length} status={status} />;
```

---

## Transportes y cuándo usar cada uno

<p align="center">
  <img src="./docs/assets/architecture.svg" alt="Arquitectura: tu app sobre los presets, useSnapPair, HostHUD, ControllerWrapper y la CLI, construidos sobre tres capas: emparejamiento, transporte y utilidades de cliente." width="100%">
</p>

<p align="center">
  <img src="./docs/assets/transport-matrix.svg" alt="Comparación de transportes: mismo dispositivo, internet, latencia, necesidad de servidor, coste y modo sin conexión." width="100%">
</p>

| Si necesitas… | Usa | Por qué |
|---|---|---|
| Apps de estado compartido (juegos por turnos, checklists, lobbies) con uniones verificadas en el servidor (hasta 300), autenticación y persistencia | **Firebase** (predeterminado de `useSnapPair`) | Cloud Functions admite a cada invitado; las reglas de RTDB limitan lo que pueden escribir los miembros. Solo estado compartido: sin mensajería efímera |
| Entrada desde teléfonos por internet, salas de hasta cientos de personas, despliegue sencillo | **PartyKit** | Un relay WebSocket diminuto ([`examples/partykit/`](./examples/partykit/)); el navegador del anfitrión es dueño de la sala |
| La latencia más baja (dibujo, juegos, movimiento) | **WebRTC** | DataChannels peer-to-peer; la señalización va por PartyKit (o cualquier transporte con mensajería) |
| Varias ventanas o pantallas en **una** sola máquina, sin conexión | **BroadcastChannel** | Sin red, sin servidor, sin cuenta |

Los cuatro implementan la misma interfaz `Transport` (`connect`, `createRoom`, `joinRoom`, `setState`, `send`, `broadcast`, `onMessage`, `onPeers`, `onState`, `onStatus`…), así que cambiar es cuestión de una línea. Consulta `transport.capabilities` (`messaging`, `presence`, `serverAuthoritativeJoin`) cuando tu interfaz necesite degradarse con elegancia.

> **Firebase no tiene mensajería efímera.** `FirebaseTransport` informa `capabilities.messaging === false` y rechaza `send`/`broadcast`, y `setState` reemplaza el objeto de estado completo, así que varios escritores simultáneos se pisarían entre sí. Los siete presets transmiten entrada en tiempo real, por lo que ninguno funciona sobre Firebase. Si eliges Firebase, `npx snap-pair init` ofrece dos opciones: una app de Firebase solo con configuración (`preset: null`, estado compartido mediante `useSnapPair`), o Firebase para tu app más PartyKit para los mensajes en tiempo real del preset.

```ts
import { PartyKitTransport, WebRTCTransport, FirebaseTransport } from 'snap-pair-core';

const party = new PartyKitTransport({ host: 'my-relay.me.partykit.dev', pairing: 'pin' });
const p2p = new WebRTCTransport({ signaling: party }); // DataChannel star, host in the middle
const fb = new FirebaseTransport({ db, auth, functions }); // server-authoritative rooms, shared state only
```

WebRTC se reconecta solo (primero un ICE restart sobre la misma conexión, luego nuevas ofertas con backoff exponencial) y divide en fragmentos los frames de más de 16 KiB (hasta 1 MiB por mensaje). Pasa `reconnect: false` para desactivar la recuperación.

---

## Presets

Siete patrones de UX listos para usar. Cada uno tiene una plantilla que puedes generar con `npx snap-pair init`, un transporte recomendado, formatos de mensaje y un límite de frecuencia que la plantilla respeta (`PRESETS` / `getPreset(id)` lo exponen todo).

<table>
  <tr>
    <td width="33%" align="center"><img src="./site/assets/img/presets/stroke-stream.svg" alt="Stroke Stream: dibuja en tu teléfono y los trazos llegan en vivo a la pantalla grande. Recomendado: WebRTC o PartyKit." width="100%"></td>
    <td width="33%" align="center"><img src="./site/assets/img/presets/particle-blast.svg" alt="Particle Blast: toca o desliza para lanzar ráfagas de partículas sobre el lienzo del anfitrión. Recomendado: PartyKit o WebRTC." width="100%"></td>
    <td width="33%" align="center"><img src="./site/assets/img/presets/type-throw.svg" alt="Type Throw: escribe una palabra y lánzala al muro compartido. Recomendado: PartyKit o WebRTC." width="100%"></td>
  </tr>
  <tr>
    <td align="center"><img src="./site/assets/img/presets/room-quiz-poll.svg" alt="Room Quiz / Poll: todos responden en su teléfono y los resultados aparecen al instante. Recomendado: PartyKit con emparejamiento por PIN." width="100%"></td>
    <td align="center"><img src="./site/assets/img/presets/virtual-controller.svg" alt="Virtual Controller: una cruceta y botones convierten cada teléfono en un mando de juego. Recomendado: WebRTC o PartyKit." width="100%"></td>
    <td align="center"><img src="./site/assets/img/presets/motion-sensor.svg" alt="Motion / Sensor: inclina, agita y gira usando la orientación del dispositivo. Recomendado: WebRTC o PartyKit." width="100%"></td>
  </tr>
  <tr>
    <td align="center"><img src="./site/assets/img/presets/local-multi-display.svg" alt="Local Multi-Display: sincroniza ventanas y pestañas en una sola máquina, incluso sin conexión. Recomendado: BroadcastChannel." width="100%"></td>
    <td colspan="2" valign="middle">
      <b>Ids de los presets</b> (para la CLI y <code>snap-pair.config.json</code>):<br><br>
      <code>stroke-stream</code> · <code>particle-blast</code> · <code>type-throw</code> · <code>room-quiz-poll</code> · <code>virtual-controller</code> · <code>motion-sensor</code> · <code>local-multi-display</code>
    </td>
  </tr>
</table>

| Preset | id | El anfitrión muestra | El teléfono envía | Transportes (**recomendado** primero) | Emparejamiento (predeterminado primero) |
|---|---|---|---|---|---|
| Stroke Stream | `stroke-stream` | Lienzo compartido | Trazos del puntero | **WebRTC** · PartyKit · BroadcastChannel | QR · code · PIN |
| Particle Blast | `particle-blast` | Campo de partículas | Toques / deslizamientos | **PartyKit** · WebRTC · BroadcastChannel | QR · PIN · code |
| Type Throw | `type-throw` | Muro de palabras | Texto corto | **PartyKit** · WebRTC · BroadcastChannel | QR · PIN · code |
| Room Quiz / Poll | `room-quiz-poll` | Pregunta + recuento en vivo | Votos | **PartyKit** · BroadcastChannel · WebRTC | PIN · QR · code |
| Virtual Controller | `virtual-controller` | El juego | Estado de la cruceta / botones | **WebRTC** · PartyKit · BroadcastChannel | QR · code · PIN |
| Motion / Sensor | `motion-sensor` | Escena controlada por la inclinación | Orientación / movimiento | **WebRTC** · PartyKit · BroadcastChannel | QR · code · PIN |
| Local Multi-Display | `local-multi-display` | Una escena repartida entre ventanas | Estado de la ventana | **BroadcastChannel** | broadcast |

Ningún preset admite Firebase; consulta la nota en [Transportes](#transportes-y-cuándo-usar-cada-uno).

---

## CLI

```bash
npx snap-pair init                                    # interactive wizard (default command)
npx snap-pair init --yes --preset room-quiz-poll --out my-quiz
npx snap-pair init --yes --architecture managed --no-scaffold   # Firebase config only
npx snap-pair presets                                 # list the 7 presets (--json for the registry)
npx snap-pair recommend "a tilt racing game for 4 friends"
```

El asistente habla inglés o japonés (según `LANG` / `LC_ALL`, o con `--lang en|ja`) y ofrece cuatro puntos de entrada (`--path` se salta el menú):

| Camino (`--path`) | Respondes | Obtienes |
|---|---|---|
| **1. Por experiencia** (`ux`) | Cuál de los 7 presets encaja mejor | Ese preset y luego un transporte que admita (el recomendado primero) |
| **2. Por arquitectura** (`architecture`) | Mismo dispositivo, tiempo real, P2P o gestionado | Un transporte y luego los presets que encajan con él |
| **3. Por stack** (`stack`) | Lo que ya tienes: Firebase, Cloudflare/PartyKit o ningún backend | Un transporte construido alrededor de tu stack |
| **4. Descríbelo** (`consult`) | Una frase en inglés o japonés, p. ej. "el público vota en una pantalla del escenario" | Una recomendación basada en reglas que puedes aceptar o ajustar |

Si eliges Firebase, se ofrece una app de Firebase solo con configuración o Firebase más PartyKit para los mensajes en tiempo real del preset. Todos los caminos escriben **`snap-pair.config.json`** y generan una plantilla Vite + React (anfitrión y mando en una sola app, elegidos por URL), además de un relay de PartyKit (`party/server.ts`) cuando el transporte lo necesita:

```json
{
  "$schema": "./node_modules/snap-pair-core/dist/config.schema.json",
  "version": 1,
  "preset": "room-quiz-poll",
  "transport": "partykit",
  "pairing": "pin",
  "locale": "en",
  "maxPlayers": 300,
  "partykit": { "host": "", "party": "main" }
}
```

| Opción | Significado |
|---|---|
| `--preset <id\|none>` | Uno de los 7 ids de preset, o `none` |
| `--transport <t>` | `broadcast` \| `partykit` \| `webrtc` \| `firebase` |
| `--pairing <m>` | `qr` \| `code` \| `pin` \| `broadcast` |
| `--architecture <a>` | `same-device` \| `realtime` \| `p2p` \| `managed` |
| `--stack <s>` | `firebase` \| `cloudflare` \| `none` |
| `--describe <text>` | Idea en texto libre para el camino `consult` |
| `--out <dir>` | Carpeta de destino (predeterminada: `./snap-pair-<preset>`) |
| `--no-scaffold`, `--force` | Solo configuración; sobrescribir archivos existentes |
| `-y, --yes` | Aceptar todos los valores predeterminados (no interactivo) |
| `--json` | Resultado JSON en stdout (`config`, `files`, `nextSteps`) |
| `--lang <en\|ja>` | Idioma |

Vuelve a ejecutar el comando cuando quieras cambiar tus elecciones.

---

## Para todos (no ingenieros)

**¿Qué es esto?** Una forma de hacer que los teléfonos de muchas personas se unan al instante a una sola pantalla compartida. Cada persona escanea un código QR (o escribe un código corto) en su navegador habitual, sin descargar ninguna app, y su teléfono pasa a formar parte de una experiencia en vivo y sincronizada. Ideal para eventos, locales, clases, transmisiones, salas de exposición y exhibiciones.

Estos son tres caminos separados, no pasos de un mismo proceso. Elige el que coincida con lo que quieres hacer ahora.

### Camino A: Solo quiero verlo funcionar

- **En tu navegador, ahora mismo:** abre la [demo en vivo](https://takaoumehara.github.io/snap-pair-skill/demo.html) en dos pestañas. Una es el anfitrión y muestra un PIN; escríbelo en la otra y dibuja. No hay nada que configurar.
- **Entre dos teléfonos:** descarga [`examples/snap-pair-lite.html`](./examples/snap-pair-lite.html), ábrelo y escanea el código QR con un segundo dispositivo. Es una demo fija de tres en raya que funciona en el plan gratuito Spark de Firebase, sin tarjeta de crédito (consulta [`examples/README.md`](./examples/README.md)).

### Camino B: Que una IA me construya mi propia app

**No** necesitas descargar ni clonar este repositorio. Basta con conectar dos herramientas pequeñas (servidores MCP) y pedirle a la IA que lea las instrucciones de construcción del proyecto desde la web. Necesitas una herramienta de codificación con IA que pueda ejecutar comandos y obtener páginas web (Claude Code, Cursor, Codex, Gemini CLI o similar).

1. Abre un chat en tu herramienta de IA en cualquier carpeta (una carpeta vacía está bien).
2. Pega esto tal cual (déjalo en inglés):

   ```
   Fetch https://raw.githubusercontent.com/takaoumehara/snap-pair-skill/main/SKILL.md
   and use it as your build instructions.

   Connect these two MCP servers if they aren't connected yet:
   - firebase: npx -y firebase-tools@latest mcp
   - snap-pair-provisioner: npx -y snap-pair-provisioner

   Then help me build: [describe what you want, e.g. "a live quiz game where
   guests join by QR code and answer on their phones"].
   ```

3. Responde a las preguntas de la IA a medida que surjan. Te preguntará qué cuenta de Google usar para Firebase y, en algún momento, mostrará un enlace de inicio de sesión de un solo uso. Ese clic es el único paso manual, a propósito, por la seguridad de tu cuenta.

Si tu herramienta no puede obtener páginas web, descarga solo [`SKILL.md`](./SKILL.md) y pega su contenido en el chat.

### Camino C: Trabajar con el código fuente

Ejecuta `git clone https://github.com/takaoumehara/snap-pair-skill.git`, luego `npm install` y `npm test`, y lee la sección API overview del README en inglés y las notas de diseño en [`docs/`](./docs/).

---

## Nota sobre Firebase

Solo hace falta para el transporte de Firebase. PartyKit, WebRTC y BroadcastChannel no usan Firebase en absoluto.

- **Firebase Emulator:** se ejecuta en tu ordenador, **sin tarjeta de crédito**, solo en local. Ideal para aprender y experimentar.
- **Plan Spark (gratis):** **sin tarjeta**, permite un sitio público, pero Realtime Database tiene un límite de **100 conexiones simultáneas** y **no puede desplegar Cloud Functions**. Sirve para el modo Lite o para otros transportes.
- **Plan Blaze (pago por uso):** necesario para el modo seguro (salas verificadas en el servidor) y **requiere tarjeta de crédito**. Conserva las cuotas gratuitas, así que un evento pequeño suele no costar nada. **Configura una alerta de presupuesto** en la consola de Firebase (las alertas avisan, pero no ponen un tope a los cargos).

## Notas de seguridad

- **Un código de emparejamiento localiza una sala. No es una contraseña.** Trata los códigos QR, los códigos de sala y los PIN como puntos de encuentro.
- **Firebase (modo seguro)** tiene autoridad en el servidor: Cloud Functions crea las salas y admite a los participantes, y las reglas de RTDB solo permiten a los miembros admitidos leer o actualizar campos acotados.
- **PartyKit, WebRTC y BroadcastChannel** son transportes de relay con autoridad en el anfitrión: ningún servidor admite a los participantes (`capabilities.serverAuthoritativeJoin === false`). Controla la entrada con `admit(peer)` y `maxPlayers`.
- Un PIN de 6 dígitos solo tiene 10⁶ valores posibles. En un relay público, añade límites de frecuencia (consulta [`examples/partykit/`](./examples/partykit/)) y no uses solo un PIN para nada sensible.

---

## Más documentación

La **referencia completa de la API**, las **preguntas frecuentes** y la **hoja de ruta** están en el [README en inglés](https://github.com/takaoumehara/snap-pair-skill/blob/main/README.md#api-overview) y en el [sitio de documentación](https://takaoumehara.github.io/snap-pair-skill/).

## Licencia

MIT. Consulta [LICENSE](./LICENSE).

> v2.1.0+ adds experimental ultrasonic (Proximity) sound pairing alongside QR and PIN. See the English README for API details and limitations.
