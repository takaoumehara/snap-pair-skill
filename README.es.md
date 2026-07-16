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

**¿Cómo se usa (con una herramienta de codificación con IA)?**
No necesitas escribir tú mismo el código. Usando un asistente de codificación con IA (Claude Code, Cursor, Codex y similares):

1. Dale a la IA este repositorio y el archivo [`SKILL.md`](./SKILL.md).
2. Pídele, por ejemplo: "Lee snap-pair-core y SKILL.md, y crea un juego de trivia en vivo donde los invitados se unan mediante un código QR y respondan desde sus teléfonos."
3. La IA genera la aplicación por ti, siguiendo el diseño seguro y asistido por servidor descrito en SKILL.md.

**Un paso importante: la configuración de Firebase.**
En algún momento, la IA te pedirá que conectes un proyecto de **Firebase** (el servicio de Google que ejecuta el backend en tiempo real). Hay tres formas de hacerlo, y la adecuada depende de si solo quieres **aprender/construir en privado** o **dejar que otras personas lo usen de verdad**:

| Tu objetivo | Usa | ¿Tarjeta de crédito? | ¿Pueden otros unirse por URL? |
|---|---|---|---|
| Aprender, experimentar, dejar que un niño construya y pruebe | **Firebase Emulator** (se ejecuta en tu computadora) | **No requiere tarjeta** | No — solo local |
| Dejar que personas reales se unan desde sus propios teléfonos | **Plan Firebase Blaze** | **Sí, se requiere tarjeta de crédito** | Sí |

- **Aprender / construir en privado → Emulator.** Se ejecuta completamente en tu propia computadora, de forma gratuita y **sin necesidad de tarjeta de crédito**. Es perfecto para probar ideas y para que los niños aprendan a construir con IA. La única limitación: es local, así que no puedes enviarle un enlace a otra persona.
- **Salir en vivo con invitados reales → Plan Blaze.** Para publicar el backend (Cloud Functions) en internet, Firebase exige el **plan Blaze (pago por uso), que requiere tener una tarjeta de crédito registrada.** El nivel gratuito es amplio (alrededor de 2 millones de llamadas a funciones al mes son gratuitas), así que un evento pequeño normalmente no cuesta nada —pero **se requiere la tarjeta para poder activarlo.** Configura siempre una alerta de presupuesto en la consola de Firebase.
- **¿Por qué se necesita una tarjeta en primer lugar?** Por seguridad, snap-pair verifica la creación y el ingreso a las salas en el servidor (Cloud Functions), no en el navegador. Firebase no permite publicar Cloud Functions en el plan gratuito (Spark) —solo en el plan Blaze. Esa es una regla de Firebase, no una limitación de snap-pair. Si no quieres añadir una tarjeta, aun así puedes hacer todo excepto compartir un enlace público usando el Emulator.

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
