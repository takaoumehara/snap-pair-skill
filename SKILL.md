---
name: snap-pair
description: Use when building React or Next.js apps that pair nearby devices by QR code or short code with Firebase Realtime Database, especially multi-device rooms, presence, temporary sessions, or participant-limited access.
---

# snap-pair

Implement ad hoc multi-device pairing for React/Next.js with Firebase. The safe default is a server-assisted design: clients use Firebase Auth, Cloud Functions create and join rooms atomically, and Realtime Database handles scoped room subscriptions, presence, and lightweight shared state.

## Core Principle

Treat a short code as a rendezvous handle, not as authorization. The server must validate the code, enforce capacity, add the participant, and then the client may subscribe to the room.

## Private decision rooms

When a product needs private input, aggregate-only reveal, a server-frozen commitment threshold, and a synchronized finale, read [One Room, One Decision](references/one-room-one-decision.md). It defines the complete server/client boundary without depending on this repository.

The Display is read-only and must not register presence or `onDisconnect`. Production uses reCAPTCHA v3 and keeps `enforceAppCheck: true`; local Emulator verification may use a deterministic debug provider.

## Architecture

Generate these pieces for production use:

- `src/hooks/useSnapPair.ts`: React hook for auth readiness, room subscription, own presence, state updates, and leave behavior.
- `src/types/index.ts`: `SnapPlayer`, `SnapRoom`, and pairing/session types.
- `database.rules.json`: participant-limited RTDB rules with no broad room-level writes.
- `functions/src/index.ts` or app route equivalents: callable/HTTP endpoints for `createSnapRoom`, `joinSnapRoom`, and cleanup.

Use a client-only implementation only for local demos. For 30-300 simultaneous joins, server-side join logic is required.

## Firebase Setup (MCP automation vs manual)

Provision the backend before generating code. **The automated path (Google login → the AI configures Firebase for you) is the recommended default** — prefer it over hand-setup in the console. Fall back to manual only for the few steps that genuinely cannot be automated.

**Step 0 — ask which Google account to use (you cannot infer this).** Before any login, ask the user for the **Google email address** of the account that owns (or should own) the Firebase project. The AI has no way to know which account or project is intended, so always ask. Example: "Which Google account (email) should I use for Firebase?"

**Step 1 — detect what is available:**

- Check for the CLI: `firebase --version`. If missing, install: `npm install -g firebase-tools`.
- Check for a configured Firebase MCP server (e.g. `claude mcp list`). If missing, add it:
  `claude mcp add firebase -- npx -y firebase-tools@latest mcp` (the old `experimental:mcp` subcommand is gone as of firebase-tools 15.x; plain `mcp` is current).
- Also add `snap-pair-provisioner`, a thin companion MCP published from this repo's `tools/snap-pair-provisioner/`:
  `claude mcp add snap-pair-provisioner -- npx -y snap-pair-provisioner` (no clone or build needed).

**Step 2 — Google login (one-time, user-driven).** Run `firebase login` (optionally `firebase login --account <email>` to target the address from Step 0). This opens a browser for a one-time Google OAuth the user must approve; it cannot be scripted. On success the CLI prints e.g. `✔ Success! Added account you@example.com` — confirm that the account matches what the user gave in Step 0 before continuing. After this, the AI can drive setup automatically.

**Split of responsibility between the two MCP servers (live-verified 2026-07-20):**

| Task | Server | Notes |
|---|---|---|
| Create/select project, set active project | official Firebase MCP (`firebase_create_project`) | |
| Deploy `database.rules.json` | official Firebase MCP (`firebase_deploy`) | |
| Retrieve Web SDK config | official Firebase MCP (`firebase_get_sdk_config`) or `snap-pair-provisioner`'s `inject_env_variables` | provisioner also merge-writes it into `.env` |
| Create the **default** RTDB instance | `snap-pair-provisioner`'s `enable_snap_pair_services` | Do NOT use `firebase database:instances:create` for the default instance — that CLI command only provisions *additional* instances and fails on a project with none. The tool uses the Firebase Management API (`POST firebasedatabase.googleapis.com/v1beta/projects/{id}/locations/{loc}/instances?databaseId=…` with `{"type":"DEFAULT_DATABASE"}`), which works on free Spark. |
| Enable Anonymous Authentication | `snap-pair-provisioner`'s `enable_snap_pair_services` | See the 4th hard gate below — works only after the project's Auth config exists. |
| Deploy Cloud Functions and Hosting | official Firebase MCP (`firebase_deploy`) | requires Blaze, see below |

**These stay MANUAL even with both MCP servers (console/one-time, by design — do not claim you can automate them):**

1. **`firebase login`** — one-time browser OAuth by the user.
2. **Blaze (pay-as-you-go) upgrade — requires a credit card.** Cloud Functions in production need Blaze. Only the account owner can add billing in the console. Anonymous Auth + the default RTDB instance do NOT need Blaze (Spark is enough).
3. **reCAPTCHA v3 site key** for App Check — created in the Firebase console / Google Cloud, then pasted into the client config.
4. **First-time Auth initialization on a brand-new project.** A project that has never had Authentication touched has no Auth config yet; the Anonymous-Auth enable call returns `404 CONFIGURATION_NOT_FOUND` until the config exists. Initializing it via API requires Blaze; the free path is one manual click of "Get started" on the project's **Authentication** page in the console. Projects that have used Auth before don't hit this — only brand-new ones. `snap-pair-provisioner`'s `enable_snap_pair_services` detects the 404 and returns this instruction instead of a raw error; re-running the tool after the click succeeds (live-verified).

**When neither MCP server is connected (fully manual fallback):**

- Do the above in the Firebase console (create project → RTDB → paste rules → set up App Check with reCAPTCHA v3), or drive it with plain CLI commands (`firebase deploy --only database`, `--only functions`, `--only hosting`).

For a zero-setup path with no project, no Cloud Functions, and no credit card (demos, workshops, prototypes), use the `snap-pair-workshop` skill instead — it embeds a shared backend and skips all of the above.

## Data Model

Prefer this shape:

```text
pairingCodes/{code}
  roomId
  hostId
  createdAt
  expiresAt
  maxPlayers

rooms/{roomId}/meta
  hostId
  status
  createdAt
  updatedAt
  participantCount
  maxPlayers

rooms/{roomId}/players/{uid}
  id
  name
  connected
  role (host | participant)
  joinedAt
  lastSeenAt

rooms/{roomId}/state
  ...product-specific lightweight shared state

roomMembers/{roomId}/{uid}
roomCreationLimits/{uid}
  true
```

Keep high-churn per-participant data under `players/{uid}`. Do not rewrite a whole `players` array or a whole shared blob on every update.

## Hook Requirements

The hook should expose:

```ts
interface SnapPlayer {
  id: string;
  name: string;
  connected: boolean;
  role?: 'host' | 'participant';
  [key: string]: unknown;
}

interface SnapRoom<TPlayer extends SnapPlayer = SnapPlayer, TState = unknown> {
  id: string;
  code?: string;
  hostId: string;
  players: Record<string, TPlayer>;
  status: 'waiting' | 'playing' | 'finished' | 'abandoned';
  createdAt: number;
  updatedAt: number;
  state?: TState;
}
```

Return `room`, `loading`, `error`, `dbConnected`, `authReady`, `localGuest`, `createRoom`, `joinRoom`, `updateState`, `updateOwnPlayer`, `updateRoomStatus`, and `leaveRoom`.

Implementation rules:

- Sign in anonymously before room creation or joining. If auth is not ready, reject `createRoom` and `joinRoom`.
- `createRoom` calls a server endpoint. It does not write `rooms` or `pairingCodes` directly from the browser in production mode.
- `joinRoom(code)` calls a server endpoint. It does not read `rooms/{roomId}` until the server has added `roomMembers/{roomId}/{auth.uid}`.
- Subscribe only after membership exists.
- Use `onDisconnect()` for `players/{uid}/connected = false` and `lastSeenAt`.
- Register `onDisconnect()` before setting `connected = true`.
- Do not expose a generic `updateRoom(updates)` API. Use narrower APIs such as `updateState(partialState)` and `updateOwnPlayer(patch)`.
- Restrict `updateOwnPlayer` to `name`, `connected`, and `lastSeenAt`; IDs, roles, and join timestamps are server-controlled.
- For host-controlled fields such as `status`, provide a separate host-only API such as `updateRoomStatus`.

## Server Join Requirements

Use Cloud Functions, Next.js route handlers with Admin SDK, or another trusted backend for room creation and joining.

`createSnapRoom` must:

- Require `context.auth.uid` or a verified Firebase ID token.
- Generate `roomId` with `crypto.randomUUID()` or strong random bytes.
- Generate a 6-character code from a font-safe alphabet such as `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`.
- Cap code TTL, usually 30 seconds to 5 minutes.
- Write room metadata, host player, membership, and pairing code in one multi-location update.
- Store `maxPlayers` with an upper bound, usually `<= 300`.

`joinSnapRoom` must:

- Require auth.
- Normalize the code and validate it server-side.
- Reject expired codes and abandoned/full rooms.
- Enforce capacity with one conflict-safe server operation: Admin SDK `transaction()` or REST ETag compare-and-set. Never use a client-side read/count/write sequence.
- Be idempotent for rejoin by the same `uid`.
- Add `roomMembers/{roomId}/{uid}` before the client subscribes to `rooms/{roomId}`.
- Add or update `players/{uid}` with `id === uid`.

For capacity, transact on a single join ledger such as:

```text
rooms/{roomId}/joinState
  count
  members/{uid}: true
```

The atomic updater should add the uid and increment `count` only if the uid is not already present and `count < maxPlayers`. A REST ETag implementation must read with `X-Firebase-ETag: true`, write with `If-Match`, and recompute from a fresh read after every `412`. Use `Bearer owner` only when the request URL targets `FIREBASE_DATABASE_EMULATOR_HOST`; production URLs require a real Admin credential.

## Security Rules

Do not add a broad `.write` rule at `rooms/$roomId`. RTDB rules cascade: a permissive parent write can bypass narrower child intent.

Use a pattern like this and adapt field validation to the product:

```json
{
  "rules": {
    "pairingCodes": {
      ".indexOn": ["expiresAt"],
      "$code": {
        ".read": false,
        ".write": false
      }
    },
    "roomMembers": {
      "$roomId": {
        "$uid": {
          ".read": false,
          ".write": false
        }
      }
    },
    "roomCreationLimits": {
      "$uid": {
        ".read": false,
        ".write": false
      }
    },
    "rooms": {
      ".indexOn": ["meta/updatedAt"],
      "$roomId": {
        ".read": false,
        ".write": false,
        "meta": {
          ".read": "auth != null && root.child('roomMembers').child($roomId).child(auth.uid).val() === true",
          ".write": false,
          "status": {
            ".write": "auth != null && root.child('roomMembers').child($roomId).child(auth.uid).val() === true && root.child('rooms').child($roomId).child('meta').child('hostId').val() === auth.uid",
            ".validate": "newData.isString() && newData.val().matches(/^(waiting|playing|finished|abandoned)$/)"
          },
          "updatedAt": {
            ".write": "auth != null && root.child('roomMembers').child($roomId).child(auth.uid).val() === true",
            ".validate": "newData.isNumber() && newData.val() >= now - 60000 && newData.val() <= now + 60000"
          }
        },
        "players": {
          ".read": "auth != null && root.child('roomMembers').child($roomId).child(auth.uid).val() === true",
          "$uid": {
            ".write": false,
            "id": {
              ".write": false
            },
            "role": {
              ".write": false
            },
            "joinedAt": {
              ".write": false
            },
            "name": {
              ".write": "auth != null && auth.uid === $uid && root.child('roomMembers').child($roomId).child(auth.uid).val() === true"
            },
            "connected": {
              ".write": "auth != null && auth.uid === $uid && root.child('roomMembers').child($roomId).child(auth.uid).val() === true"
            },
            "lastSeenAt": {
              ".write": "auth != null && auth.uid === $uid && root.child('roomMembers').child($roomId).child(auth.uid).val() === true",
              ".validate": "newData.isNumber() && newData.val() >= now - 60000 && newData.val() <= now + 60000"
            },
            "$other": {
              ".validate": false
            }
          }
        },
        "state": {
          ".read": "auth != null && root.child('roomMembers').child($roomId).child(auth.uid).val() === true",
          ".write": "auth != null && root.child('roomMembers').child($roomId).child(auth.uid).val() === true"
        },
        "joinState": {
          ".read": false,
          ".write": false
        }
      }
    }
  }
}
```

Subscribe to `meta`, `players`, and `state` separately. Do not grant read at the room parent: RTDB read grants cascade, so a parent grant would also expose server-only `joinState` and cannot be revoked by its child `.read: false`.

`state` is generic shared state and its membership-gated write should remain available. These foundation rules do not enforce a product-specific state schema, payload-size limit, or write-rate limit. Add product-specific validation, bounded payloads, and throttling/rate limiting before production use.

If the app must let guests resolve codes directly from the client, treat that as demo mode. In production, resolve codes through the server so expired codes, attempts, and abuse controls are enforceable.

## Presence And Lifecycle

- Use `.info/connected` to reflect local database connectivity.
- On connect, register `onDisconnect()` for the player's `connected` field before writing `connected: true`; write `lastSeenAt` with a server timestamp during presence updates.
- Cancel `onDisconnect` on explicit leave after writing the intended leave state.
- Host graceful leave may set `meta/status = abandoned`.
- Host crash or network loss requires backend cleanup or a host heartbeat lease. Do not rely on client `leaveRoom()` for abandonment.
- Schedule cleanup for expired codes, abandoned rooms, and inactive rooms.
- Immediate host `onDisconnect` abandonment favors availability detection over reconnection tolerance. Prefer a server-managed heartbeat lease when brief host network loss must not end a room.

## Scaling Guidance

- 30-300 participants in one room is feasible for lightweight state, presence, voting, controller input, and checklists.
- Avoid per-keystroke or pointer-move writes from every device. Throttle, debounce, or batch high-frequency input.
- Scope listeners tightly: subscribe to `state` and `players` only when needed, and avoid root room listeners for very large rooms unless the UI needs all data.
- Move media, large files, photos, and binary payloads to Cloud Storage or WebRTC/media services. Store only metadata and pointers in RTDB.

## Payments

Payments are outside this foundation. If required, implement them through a separate trusted server integration with membership checks and provider webhook verification.

## Common Mistakes

- Do not use arrays for players. Use `players/{uid}`.
- Do not enforce `maxPlayers` with `Object.keys(players).length` on the client.
- Do not make `pairingCodes` publicly writable or long-lived.
- Do not allow `rooms/$roomId.write` for all participants.
- Do not let clients create authoritative membership records directly.
- Do not use `Math.random()` for room IDs or security-sensitive tokens.
- Do not claim host disconnect abandonment works unless a backend heartbeat/cleanup path exists.
