# snap-pair-core

**English** · [日本語](https://github.com/takaoumehara/snap-pair-core/blob/main/README.ja.md) · [简体中文](https://github.com/takaoumehara/snap-pair-core/blob/main/README.zh-CN.md) · [Español](https://github.com/takaoumehara/snap-pair-core/blob/main/README.es.md) · [한국어](https://github.com/takaoumehara/snap-pair-core/blob/main/README.ko.md)

Pair phones and browsers with a QR code or a six-character code, then share
live state across every device in the room. No app install. React hook on the
client; Firebase Auth + Cloud Functions + Realtime Database on the server.

This repository is the **open engine** (MIT). It is intentionally generic — you
bring the product (the game, the vote, the checklist, the light show) and build
it on top.

**Want to see it work in 2 minutes, with no credit card?** Open
[`examples/snap-pair-lite.html`](./examples/) — a one-file tic-tac-toe two
phones can play by scanning a QR code, running on the free Firebase Spark plan.

---

## For everyone (non-engineers)

**What is this?**
A way to make many people's phones join one shared screen instantly. Everyone
scans a QR code (or types a short code) in their normal browser — no app to
download — and their phones become part of one live, synchronized experience.

**Who is it for?**
- People who run **events, venues, classes, streams, showrooms, or exhibitions**
  and want the audience to participate with their own phones.
- The **engineers and AI builders** who make those experiences for them.

**What can you build with it?**
- Live voting, polls, and quizzes on a big screen
- Group checklists and "everyone's ready" confirmations
- Audience reactions, prediction games, collaborative drawing
- A synchronized phone light show across a whole room
- Any "one shared screen + many phones + instant result" moment

**How do you use it (with an AI coding tool)?**
You do **not** have to write the code yourself. Using an AI coding assistant
(Claude Code, Cursor, Codex, and similar):

1. Give the AI this repository and the [`SKILL.md`](./SKILL.md) file.
2. Ask it, for example: *"Read snap-pair-core and SKILL.md, and build a live
   trivia game where guests join by QR code and answer on their phones."*
3. The AI generates the app for you, following the safe, server-assisted
   design in SKILL.md.

**One important step: Firebase setup.**
At some point the AI will need you to connect a **Firebase** project (Google's
service that runs the realtime backend). There are three ways to do this, and
the right one depends on whether you just want to **learn/build privately** or
**let other people actually use it**:

| Your goal | Use | Credit card? | Can others join by URL? |
|---|---|---|---|
| Learn, experiment, let a child build & test | **Firebase Emulator** (runs on your computer) | **No card needed** | No — local only |
| Let people join a casual/playful thing (game, poll, board), free | **Client-direct on the free Spark plan** | **No card needed** | **Yes** |
| Let real people join a **secure** app (private rooms, moderation, anti-cheat) | **Server-assisted on the Blaze plan** | **Yes, a credit card is required** | Yes |

There are **two designs**, and they need different plans. This is the single
most misunderstood point:

- **Client-direct (simple, playful) → free Spark plan, no card, and others CAN
  join by URL.** The browser talks to the Realtime Database directly, with
  **no Cloud Functions**. Since the thing that forces Blaze is Cloud Functions,
  and this design has none, it runs entirely on the **free Spark plan** — a
  public link and all. This is the ["workshop" pattern](./examples/): great for
  games, votes, drawing boards, quizzes, buzzers, prototypes, and small
  installations. The trade-off is that the room data is open (anyone with the
  code can read/write it), so don't put secrets or money in it.
- **Server-assisted (secure) → Blaze plan, card required.** When you need
  private input, membership-gated rooms, moderation, or anti-peek, snap-pair
  validates every room creation and join on the server (Cloud Functions).
  **Firebase only lets Cloud Functions deploy on the paid Blaze plan**, which
  needs a card on file. That's a Firebase rule, not a snap-pair limitation. The
  free allowance is large (about 2 million function calls/month), so a small
  event usually costs nothing — but the card is required to turn it on. Always
  set a budget alert.
- **Learning / building privately → Emulator.** Runs entirely on your own
  computer, free, no card — but local only, so you can't send others a link.

### Spark vs Blaze — plain-language comparison

| | **Spark (free)** | **Blaze (pay-as-you-go)** |
|---|---|---|
| Credit card | Not needed | Required |
| If you hit a limit | The product just pauses until next month — **you are never charged** | Only the overage is billed (Spark allowances stay free) |
| Devices connected at once (per project) | **100** | up to 200,000 |
| Realtime Database | 1 GB stored + 10 GB/month download, **free** | **No free RTDB allowance** — billed from the first byte (~$5/GB stored, ~$1/GB downloaded) |
| Cloud Functions | **Not available** | Available (free monthly allowance) |

- **Spark is right for most people:** personal, family, classroom, a small
  booth/showroom, prototypes, "I never want a bill," and up to 100 devices at
  once — using the client-direct design.
- **Blaze is clearly better when:** more than ~100 devices connect at the same
  time; you need Cloud Functions or any server-side logic; you need the secure /
  membership-gated design; Functions must reach the outside internet. New
  accounts get $300 credit and keep every Spark free allowance — but the card is
  required to switch it on.
- **Honest nuance:** for pure Realtime-Database use, **Spark is actually more
  generous than Blaze** (Spark gives 1 GB / 10 GB free; Blaze bills RTDB from
  zero). You move to Blaze for Cloud Functions or the 100-connection ceiling,
  not because RTDB is cheaper there.

### You don't need to share anyone's backend

You can make your **own** free Spark project once and reuse it across every
client-direct tool you build — private to your project, no card, impossible to
bill. Create a project (stay on Spark), enable Realtime Database, publish open
rules for your path, copy the web config, and use it. See the workshop examples
in [`examples/`](./examples/) for the exact rules and client pattern.

---

## For engineers

`snap-pair-core` is a React/Firebase Realtime Database foundation for
temporarily pairing browsers via a QR or six-character code, with presence and
lightweight shared state for rooms of up to 300 participants.

Production is server-assisted. Firebase Auth identifies each browser, Cloud
Functions create rooms and admit participants, and RTDB security rules let only
admitted room members subscribe or update narrowly scoped fields. A short
pairing code locates a room; it is **not** an authorization credential.

### Architecture

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

### React usage

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

### Data layout

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

## Firebase setup: three paths

Choose based on whether you need a shareable URL and whether you can add a card.

### 1. Emulator — free, no credit card, local only (best for learning)

The Firebase Emulator Suite runs Auth, Realtime Database, and Cloud Functions
entirely on your machine. No billing account, no card.

```bash
npm install
npm --prefix functions install
npm --prefix functions run build
npx firebase-tools emulators:start --only auth,database,functions
```

Everything runs locally. You cannot give other people a public link from the
emulator — it is for development and learning.

### 2. Spark (free) plan — what it can and cannot do

The Spark plan needs **no credit card**, serves a public site via Firebase
Hosting, and allows Realtime Database with a hard cap of **100 simultaneous
connections**. **However, Spark cannot deploy Cloud Functions** — and snap-pair
relies on Cloud Functions for secure room creation and joining. So Spark alone
is not enough to run the full server-assisted design publicly.

### 3. Blaze (pay-as-you-go) plan — required to go live (credit card needed)

To deploy Cloud Functions to the public internet, the project must be on the
**Blaze plan, which requires a credit card / billing account.** Blaze keeps the
free quotas (about **2,000,000 function invocations/month** free; RTDB up to
200,000 simultaneous connections) and only bills beyond them, so a small event
often costs nothing — but the card must be on file to enable it.

```bash
npm --prefix functions run build
firebase use YOUR_EXISTING_PROJECT
firebase deploy --only functions
firebase deploy --only database
```

Both callables enforce Firebase App Check; configure a debug token for local
development against a real project, and never disable enforcement in the
deployed callable. **Set a budget alert** in Firebase console → Usage and
billing. (Budget alerts notify but do not hard-cap charges; a hard cutoff needs
a custom billing function.)

---

## Verification

```bash
npm test
npm run typecheck
npm --prefix functions test
npm --prefix functions run typecheck
npm run test:rules-emulator
```

## AI agent skill

[`SKILL.md`](./SKILL.md) lets an AI coding agent generate a correct,
server-assisted snap-pair integration for a new product. Copy it into your
agent's skills directory. For a private-input, aggregate-reveal,
commitment-threshold pattern, see
[`references/one-room-one-decision.md`](./references/one-room-one-decision.md).

## Payments

Payments are outside this foundation. If a product needs them, add a separate
trusted server integration with membership checks and provider webhook
verification.

## License

MIT — see [LICENSE](./LICENSE).
