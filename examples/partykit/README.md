# snap-pair PartyKit relay

A minimal [PartyKit](https://www.partykit.io/) server for `PartyKitTransport`.
It relays snap-pair wire-protocol frames (see `src/transports/protocol.ts`)
between the browsers in a room and announces dropped sockets. It stores
nothing: the browser that created the room is authoritative for the roster
and the shared state.

## Run it

```bash
cd examples/partykit
npx partykit dev          # ws://localhost:1999
npx partykit deploy       # wss://snap-pair-relay.<your-user>.partykit.dev
```

`partykit` is not a dependency of `snap-pair-core`, and this folder is
excluded from the package typecheck (`tsconfig.json` only includes `src/`).

## Connect from the app

```ts
import PartySocket from 'partysocket'; // optional peer dependency
import { PartyKitTransport } from './src'; // snap-pair-core's src/index.ts

const transport = new PartyKitTransport({
  host: 'localhost:1999', // or 'snap-pair-relay.<your-user>.partykit.dev'
  pairing: 'pin',         // or 'code' (default)
  socketFactory: (params) => new PartySocket(params),
});
await transport.connect();
const { pairing } = await transport.createRoom({ initialState: {} });
```

Without `socketFactory`, the transport tries `import('partysocket')` and
falls back to the global `WebSocket` (reconnecting with exponential backoff).
Bundled apps should pass `socketFactory` explicitly: the default import uses
a variable specifier so bundlers don't fail when `partysocket` isn't installed.

## What the server enforces

- Frames must be text, at most 64 KiB, protocol version 1, and addressed to
  this room.
- `from` must equal the sender's connection id. Clients connect with
  `id = peerId`, so one peer cannot impersonate another.
- At most 64 connections per room.

It does **not** authenticate peers. Anyone who knows (or guesses) a room code
or PIN can ask to join; the host admits peers, and you can gate them with the
transport's `admit` option. Six-digit PINs have only 10^6 values, so add
rate limiting (for example in `onConnect`) before using PIN rooms for anything
sensitive.
