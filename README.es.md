# snap-pair-core

[English](https://github.com/takaoumehara/snap-pair-core/blob/main/README.md) · [日本語](https://github.com/takaoumehara/snap-pair-core/blob/main/README.ja.md) · [简体中文](https://github.com/takaoumehara/snap-pair-core/blob/main/README.zh-CN.md) · **Español** · [한국어](https://github.com/takaoumehara/snap-pair-core/blob/main/README.ko.md)

Empareja teléfonos y navegadores mediante un código QR o un código de seis caracteres, y comparte el estado en vivo entre todos los dispositivos de la sala. No requiere instalar ninguna app. En el cliente se usa un hook de React; en el servidor, Firebase Auth + Cloud Functions + Realtime Database.

Este repositorio es el **motor abierto** (MIT). Es intencionalmente genérico: tú aportas el producto (el juego, la votación, la lista de verificación, el espectáculo de luces) y lo construyes sobre esta base.

---

## Para todos (no ingenieros)

**¿Qué es esto?**
Una forma de hacer que los teléfonos de muchas personas se unan instantáneamente a una sola pantalla compartida. Cada persona escanea un código QR (o escribe un código corto) en su navegador habitual —sin necesidad de descargar ninguna app— y su teléfono pasa a formar parte de una experiencia en vivo y sincronizada.

**¿Para quién es?**
- Personas que organizan **eventos, locales, clases, transmisiones en vivo, salas de exposición o exhibiciones** y quieren que el público participe con sus propios teléfonos.
- Los **ingenieros y desarrolladores que trabajan con IA** que crean esas experiencias para ellos.

**¿Qué puedes construir con esto?**
- Votaciones en vivo, encuestas y trivias en una pantalla grande
- Listas de verificación grupales y confirmaciones de "todos listos"
- Reacciones del público, juegos de predicción, dibujo colaborativo
- Un espectáculo de luces sincronizado con los teléfonos de toda la sala
- Cualquier momento del tipo "una pantalla compartida + muchos teléfonos + resultado instantáneo"

### ¿Qué quieres hacer? Elige uno

Hay tres formas distintas de usar este repositorio. **Elige la que coincida con lo que realmente quieres hacer ahora** — no son pasos de un mismo proceso, sino caminos separados. No hace falta hacer los tres.

| | **A. Solo quiero verlo funcionar** | **B. Que una IA me construya mi propia app** | **C. Trabajar con el código fuente** |
|---|---|---|---|
| **Para** | "Quiero verlo funcionando en 2 minutos" | "Quiero una app personalizada, pero no quiero escribir ni gestionar código" | "Soy ingeniero/a, quiero leer/modificar el código fuente o contribuir" |
| **Qué instalas** | Nada | Una herramienta de codificación con IA (probablemente ya la tienes) | Una herramienta de codificación con IA **y** conocimientos de Git/Node.js |
| **Qué descargas** | Un archivo HTML | **Nada** — la IA se conecta directamente, sin descargar el repositorio | Todo el repositorio (`git clone` o ZIP) |
| **¿Necesitas tarjeta de crédito?** | No | Depende de lo que construyas — ver la tabla de Firebase más abajo | Depende de lo que construyas |
| **¿Puedes compartir un enlace con otros?** | Sí (misma sala, misma red/Wi-Fi) | Sí, una vez desplegado | Sí, una vez desplegado |
| **Más detalles** | "Camino A" a continuación | "Camino B" a continuación | Sección "Para ingenieros" más abajo |

---

### Camino A: Solo quiero verlo funcionar (2 minutos, sin configuración)

1. Descarga este único archivo: [`examples/snap-pair-lite.html`](./examples/snap-pair-lite.html)
2. Ábrelo en tu navegador (doble clic).
3. Escanea el código QR con un segundo teléfono o navegador.

Eso es todo — sin instalación, sin cuenta, sin tarjeta de crédito. Esto es una demo fija (un tres en raya que pueden jugar dos teléfonos), no una app personalizada — para eso, ve al Camino B.

---

### Camino B: Que una IA me construya mi propia app (sin necesidad de descargar nada)

**Este es el punto que suele generar más confusión:** para este camino **no** necesitas descargar este repositorio, clonarlo ni descomprimir nada. Basta con conectarte a dos herramientas pequeñas (llamadas servidores MCP) — exactamente igual que conectarte a cualquier otro servidor MCP. Lo único distinto respecto a una conexión MCP normal es pedirle a la IA que lea las instrucciones de construcción de este proyecto directamente desde la web, para que sepa la forma correcta y segura de construir una app con snap-pair.

**Lo primero que necesitas:** una herramienta de codificación con IA que pueda ejecutar comandos y obtener páginas web — Claude Code, Cursor, Codex, Gemini CLI o similar. Si aún no tienes ninguna, consulta ["Todavía no tengo una herramienta de codificación con IA"](#todavía-no-tengo-una-herramienta-de-codificación-con-ia) más abajo.

**Paso 1 — abre un chat en tu herramienta de IA**, en cualquier carpeta de proyecto (una carpeta nueva y vacía está bien — esta se convertirá en tu app).

**Paso 2 — escribe esto en el chat, tal cual:**

```
Obtén https://raw.githubusercontent.com/takaoumehara/snap-pair-core/main/SKILL.md
y úsalo como tus instrucciones de construcción.

Conéctate a estos dos servidores MCP si aún no están conectados:
- firebase: npx -y firebase-tools@latest mcp
- snap-pair-provisioner: npx -y snap-pair-provisioner

Después, ayúdame a construir: [describe lo que quieres — p. ej. "un juego de
trivia en vivo donde los invitados se unan mediante un código QR y respondan
desde sus teléfonos"].
```

**Paso 3 — responde a las preguntas de la IA a medida que surjan.** Normalmente preguntará qué cuenta de Google usar para Firebase, y en algún momento te mostrará un enlace de un solo uso para iniciar sesión en Firebase desde tu navegador (este único clic es el único paso manual de todo el proceso — no puede automatizarse, por diseño, para proteger tu cuenta).

Si tu herramienta de IA no puede obtener páginas web, pídele que te lo indique — y como alternativa, descarga solo el archivo `SKILL.md` de este repositorio y pega su contenido en el chat en lugar de la instrucción de obtención anterior.

#### Todavía no tengo una herramienta de codificación con IA

Elige **una** (solo necesitas una):
- **[Cursor](https://cursor.com)** — la opción más sencilla: un editor de código completo con chat de IA integrado. Descárgalo e instálalo como cualquier otra app.
- **Claude Code** — instala la extensión desde el marketplace de VS Code si ya usas VS Code, o el CLI independiente desde [claude.com/code](https://claude.com/code).
- **Codex** o **Gemini CLI** — si ya usas las herramientas de codificación de OpenAI o Google.

Una vez instalada, ábrela, abre (o crea) una carpeta para tu proyecto, y continúa con el Paso 1 anterior.

---

### Configuración de Firebase: qué significa para el Camino B

En algún momento del Camino B, la IA necesitará conectar un proyecto de **Firebase** (el servicio de Google que ejecuta el backend en tiempo real). La opción adecuada depende de si quieres **aprender/construir en privado** o **dejar que otras personas lo usen de verdad**:

| Tu objetivo | Usa | ¿Tarjeta de crédito? | ¿Pueden otros unirse por URL? |
|---|---|---|---|
| Aprender, experimentar, dejar que un niño construya y pruebe | **Firebase Emulator** (se ejecuta en tu computadora) | **No requiere tarjeta** | No — solo local |
| Dejar que personas reales se unan desde sus propios teléfonos | **Plan Firebase Blaze** | **Sí, se requiere tarjeta de crédito** | Sí |

- **Aprender / construir en privado → Emulator.** Se ejecuta completamente en tu propia computadora, de forma gratuita y **sin necesidad de tarjeta de crédito**. Es perfecto para probar ideas y para que los niños aprendan a construir con IA. La única limitación: es local, así que no puedes enviarle un enlace a otra persona.
- **Salir en vivo con invitados reales → Plan Blaze.** Para publicar el backend (Cloud Functions) en internet, Firebase exige el **plan Blaze (pago por uso), que requiere tener una tarjeta de crédito registrada.** El nivel gratuito es amplio (alrededor de 2 millones de llamadas a funciones al mes son gratuitas), así que un evento pequeño normalmente no cuesta nada —pero **se requiere la tarjeta para poder activarlo.** Configura siempre una alerta de presupuesto en la consola de Firebase.
- **¿Por qué se necesita una tarjeta en primer lugar?** Por seguridad, snap-pair verifica la creación y el ingreso a las salas en el servidor (Cloud Functions), no en el navegador. Firebase no permite publicar Cloud Functions en el plan gratuito (Spark) —solo en el plan Blaze. Esa es una regla de Firebase, no una limitación de snap-pair. Si no quieres añadir una tarjeta, aun así puedes hacer todo excepto compartir un enlace público usando el Emulator.

Los dos servidores MCP del Paso 2 anterior crean el proyecto, activan lo necesario y escriben tu `.env` por ti — no tienes que hacer clic manualmente en la consola de Firebase. Consulta [`SKILL.md`](./SKILL.md#firebase-setup-mcp-automation-vs-manual) para ver el desglose completo de qué se automatiza y qué sigue siendo un paso manual único.

---

### Camino C: Trabajar con el código fuente (ingenieros)

Este camino es para leer, modificar o contribuir al código fuente real — consulta la sección **"Para ingenieros"** más abajo. Este camino sí implica descargar el repositorio (`git clone` o "Download ZIP" en GitHub), porque estás trabajando con el propio código, no simplemente pidiéndole a una IA que genere una app nueva a partir de instrucciones.

---

## Para ingenieros

`snap-pair-core` es una base construida sobre React y Firebase Realtime Database para emparejar navegadores de forma temporal mediante un código QR o un código de seis caracteres, con presencia y estado compartido ligero para salas de hasta 300 participantes.

El entorno de producción está asistido por servidor. Firebase Auth identifica cada navegador, Cloud Functions crea las salas y admite a los participantes, y las reglas de seguridad de RTDB permiten que solo los miembros admitidos de la sala se suscriban o actualicen campos de alcance restringido. Un código de emparejamiento corto sirve para localizar una sala; **no es una credencial de autorización**.

### Arquitectura

- **Hook de React 18** (`src/hooks/useSnapPair.ts`): disponibilidad de autenticación, suscripción a la sala, presencia propia, actualizaciones de estado de alcance limitado y el comportamiento al salir.
- **Tipos** (`src/types/index.ts`): `SnapPlayer`, `SnapRoom`, tipos de emparejamiento.
- **Cloud Functions invocables** (`functions/src/`): `createSnapRoom`, `joinSnapRoom`, y una función programada `cleanupExpiredData`.
- **Reglas de seguridad** (`database.rules.json`): lecturas condicionadas a la membresía y escrituras de cliente de alcance restringido, sin escrituras amplias a nivel de sala.

La creación y el ingreso a las salas pasan por las rutas del Admin SDK dentro de `functions/`. Los navegadores no pueden leer los registros de códigos de emparejamiento, crear salas directamente, ni escribir registros de membresía o capacidad.

### Uso con React

```ts
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getFunctions } from 'firebase/functions';
import { useSnapPair } from './hooks/useSnapPair';

const pairing = useSnapPair({
  db: getDatabase(),
  auth: getAuth(),
  functions: getFunctions(),
  guest: { id: '', name: 'John Doe' },
  maxPlayers: 8,
});

const {
  room, authReady,
  createRoom, joinRoom,
  updateState, updateOwnPlayer, updateRoomStatus, leaveRoom,
} = pairing;
```

Espera a que `authReady` esté listo antes de llamar a `createRoom(initialState)` o `joinRoom(code)`. Ambas funciones llaman a funciones de servidor de confianza; una vez que el servidor persiste `roomMembers/{roomId}/{uid}`, el hook puede leer y suscribirse a esa sala.

Los miembros pueden actualizar el `state` compartido, su propio `name`, `connected` y `lastSeenAt`, además de `meta/updatedAt`. Solo el anfitrión puede cambiar el estado de la sala. Los IDs, roles, marcas de tiempo de ingreso, membresía, capacidad, códigos de emparejamiento y `joinState` siempre son gestionados de forma autoritativa por el servidor.

`state` es intencionalmente genérico y no valida un esquema específico del producto ni garantiza límites de tamaño de payload o de frecuencia de escritura. Cada producto debe añadir validación de estado, límites de payload y limitación de velocidad (throttling) tanto en el cliente como en el servidor, apropiados para sus datos y su tráfico, antes de desplegarse a producción.

### Estructura de datos

```text
pairingCodes/{code}                 # Admin SDK only
roomMembers/{roomId}/{uid}: true    # Admin SDK only; client cannot read/write
roomCreationLimits/{uid}            # Admin SDK only; fixed-hour create quota
rooms/{roomId}/meta
rooms/{roomId}/players/{uid}
rooms/{roomId}/state
rooms/{roomId}/joinState            # Admin SDK only
```

---

## Configuración de Firebase: tres caminos

Elige según si necesitas una URL que puedas compartir y si puedes añadir una tarjeta.

### 1. Emulator — gratis, sin tarjeta de crédito, solo local (ideal para aprender)

El Firebase Emulator Suite ejecuta Auth, Realtime Database y Cloud Functions completamente en tu máquina. No requiere cuenta de facturación ni tarjeta.

```bash
npm install
npm --prefix functions install
npm --prefix functions run build
npx firebase-tools emulators:start --only auth,database,functions
```

Todo se ejecuta de forma local. No puedes darle a otras personas un enlace público desde el emulador; es para desarrollo y aprendizaje.

### 2. Plan Spark (gratuito) — qué puede y qué no puede hacer

El plan Spark **no requiere tarjeta de crédito**, permite publicar un sitio público mediante Firebase Hosting, y permite usar Realtime Database con un límite estricto de **100 conexiones simultáneas**. **Sin embargo, Spark no puede desplegar Cloud Functions** —y snap-pair depende de Cloud Functions para la creación e ingreso seguros a las salas. Por lo tanto, Spark por sí solo no es suficiente para ejecutar públicamente el diseño completo asistido por servidor.

### 3. Plan Blaze (pago por uso) — necesario para salir en vivo (requiere tarjeta de crédito)

Para desplegar Cloud Functions en internet público, el proyecto debe estar en el **plan Blaze, que requiere tener registrada una tarjeta de crédito o una cuenta de facturación.** Blaze conserva las cuotas gratuitas (alrededor de **2.000.000 de invocaciones de funciones al mes** gratis; RTDB hasta **200.000 conexiones simultáneas**) y solo cobra por lo que exceda esos límites, por lo que un evento pequeño a menudo no cuesta nada —pero **la tarjeta debe estar registrada para poder habilitarlo.**

```bash
npm --prefix functions run build
firebase use YOUR_EXISTING_PROJECT
firebase deploy --only functions
firebase deploy --only database
```

Ambas funciones invocables aplican **Firebase App Check**; configura un token de depuración para el desarrollo local contra un proyecto real, y nunca desactives esta verificación en la función invocable desplegada. **Configura una alerta de presupuesto** en la consola de Firebase → Usage and billing (Uso y facturación). (Las alertas de presupuesto notifican pero no imponen un tope estricto de gasto; para un corte estricto se necesita una función de facturación personalizada.)

---

## Verificación

```bash
npm test
npm run typecheck
npm --prefix functions test
npm --prefix functions run typecheck
npm run test:rules-emulator
```

## Habilidad para agentes de IA

[`SKILL.md`](./SKILL.md) permite que un agente de codificación con IA genere una integración correcta de snap-pair, asistida por servidor, para un nuevo producto. Cópialo en el directorio de habilidades (skills) de tu agente. Para un patrón de entrada privada, revelación agregada y umbral de compromiso, consulta [`references/one-room-one-decision.md`](./references/one-room-one-decision.md).

## Pagos

Los pagos quedan fuera del alcance de esta base. Si un producto los necesita, añade una integración de servidor de confianza independiente, con verificación de membresía y validación de webhooks del proveedor de pagos.

## Licencia

MIT — consulta [LICENSE](./LICENSE).
