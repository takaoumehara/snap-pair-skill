# snap-pair-core

Pair browsers with a QR code or a six-character code, then share lightweight
realtime state across every device in the room. React hook on the client,
Firebase Auth + Cloud Functions + Realtime Database on the server.

- **No app install.** Guests open a link or scan a code in the browser.
- **2–300 devices per room**, with presence and sub-second shared state.
- **Server-assisted by default.** A short code locates a room; it is never an
  authorization credential. Cloud Functions validate the code, enforce
  capacity, and admit the participant before the client can subscribe.

This repository is the open engine. It is intentionally generic: you bring the
product (the game, the vote, the checklist, the activation) on top of it.

## Try it free — no credit card, fully local

You do **not** need a paid Firebase plan to learn or build with snap-pair.
The Firebase Emulator Suite runs Auth, Realtime Database, and Cloud Functions
entirely on your machine.

```bash
npm install
npm --prefix functions install
npm --prefix functions run build
npx firebase-tools emulators:start --only auth,database,functions
```

Everything runs locally; no billing account is involved. A paid (Blaze) plan is
only required later, when you deploy Cloud Functions to the public internet for
real users.

## Architecture

- **React 18 hook** (`src/hooks/useSnapPair.ts`): auth readiness, room
  subscription, own presence, scoped state updates, and leave behavior.
- **Types** (`src/types/index.ts`): `SnapPlayer`, `SnapRoom`, pairing types.
- **Callable Cloud Functions** (`functions/src/`): `createSnapRoom`,
  `joinSnapRoom`, and a scheduled `cleanupExpiredData`.
- **Security rules** (`database.rules.json`): membership-gated reads and narrow
  client writes, with no broad room-level write.

Room creation and joining go through the Admin SDK paths in `functions/`.
Browsers cannot read pairing-code records, create rooms directly, or write
membership/capacity records.

## React usage

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

Wait for `authReady` before calling `createRoom(initialState)` or
`joinRoom(code)`. Both call trusted server functions; after the server persists
`roomMembers/{roomId}/{uid}`, the hook may read and subscribe to that room.

Members may update shared `state`, their own `name`, `connected`, and
`lastSeenAt`, plus `meta/updatedAt`. Only the host may change room status. IDs,
roles, join timestamps, membership, capacity, pairing codes, and `joinState`
stay server-authoritative.

`state` is intentionally generic and does not validate a product-specific
schema or guarantee payload-size and write-rate limits. Every product must add
state validation, payload limits, and client/server throttling appropriate to
its data and traffic before production deployment.

## Data layout

```text
pairingCodes/{code}                 # Admin SDK only
roomMembers/{roomId}/{uid}: true    # Admin SDK only; client cannot read/write
roomCreationLimits/{uid}            # Admin SDK only; fixed-hour create quota
rooms/{roomId}/meta
rooms/{roomId}/players/{uid}
rooms/{roomId}/state
rooms/{roomId}/joinState            # Admin SDK only
```

## Deploy to a real Firebase project

```bash
npm --prefix functions run build
firebase use YOUR_EXISTING_PROJECT
firebase deploy --only functions
firebase deploy --only database
```

Both callables enforce Firebase App Check. Configure an App Check debug token
for local development against a real project, and never disable enforcement in
the deployed callable. Safe release order: Functions first, then database
rules, then the client.

## Verification

```bash
npm test
npm run typecheck
npm --prefix functions test
npm --prefix functions run typecheck
npm run test:rules-emulator
```

## AI agent skill

[`SKILL.md`](./SKILL.md) lets an AI coding agent (Claude Code, Cursor, Codex,
and others) generate a correct, server-assisted snap-pair integration for a new
product. Copy it into your agent's skills directory. For a private-input,
aggregate-reveal, commitment-threshold pattern, see
[`references/one-room-one-decision.md`](./references/one-room-one-decision.md).

## Payments

Payments are outside this foundation. If a product needs them, add a separate
trusted server integration with membership checks and provider webhook
verification.

## License

MIT — see [LICENSE](./LICENSE).
