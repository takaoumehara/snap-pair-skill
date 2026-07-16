# One Room, One Decision

Use this pattern for a small multi-device decision flow with private answers, aggregate reveal, a shortlist, collective commitment, and a synchronized result.

## Contract

- One Host creates and advances the room.
- One Display shares the Host Auth UID but is strictly read-only.
- Participants authenticate anonymously, join through a server endpoint, then subscribe.
- Public demos should cap participation at five people plus the Host.
- Every mutation includes `roomId` and `phaseVersion`; stale versions are rejected atomically.
- Responses and public state never contain an answer-to-UID mapping.
- Do not reveal aggregates with fewer than three submitted participants.

## Server-only and public data

```text
demoRooms/{roomId}                       authoritative phase and scenario
demoPrivateAnswers/{roomId}/{uid}/{stage}/{promptId}
demoCommitments/{roomId}/{uid}           individual commitment ledger
demoPublic/{roomId}                      aggregate-only client view
```

Set client read/write to `false` for the first three roots. Allow members to read `demoPublic/{roomId}` and deny every client write there. Keep generic membership and presence under the normal `rooms` and `roomMembers` roots.

## Callables

All deployed callables require Auth and App Check.

| Callable | Authority | Behavior |
| --- | --- | --- |
| `createDemoRoom` | authenticated user | Creates the secure room and all demo records atomically |
| `submitDemoAnswer` | member | Validates stage, prompt, answer allowlist, and phase version; stores privately |
| `advanceDemoPhase` | Host | Advances one legal phase and publishes aggregate-only output |
| `submitDemoCommitment` | eligible member | Adds one idempotent commitment and finalizes once at threshold |
| `resetDemoRoom` | Host | Returns to lobby and deletes private answers and commitments |

Bound every input string and server-allowlist scenario, prompt, answer, and shortlist IDs. Delete private answers on reset, completion, room cleanup, or after 24 hours.

## Phase model

```text
lobby -> private-input -> reveal -> shortlist -> commitment -> complete
```

Only the server advances phases. Freeze eligible participant UIDs and the integer threshold when commitment begins. A retry after successful finalization returns the current public result without incrementing the count or `phaseVersion` again.

Use one conflict-safe server update for each authoritative mutation:

- Admin SDK `transaction()` is the normal choice.
- REST ETag compare-and-set is valid when every retry performs a fresh ETag read and recomputes the update before an `If-Match` write.
- On the RTDB Emulator, `Bearer owner` is an admin token. Select it only when the request URL host exactly matches `FIREBASE_DATABASE_EMULATOR_HOST`; never send it to production.

## Client roles

- Host subscribes to public room slices and invokes Host-only callables.
- Participant owns presence, submits private choices through callables, and never writes authoritative demo state.
- Display subscribes to public slices only. It exposes no mutation API, performs no presence write, and registers no `onDisconnect` handler.
- Preview is explicitly labelled simulated, performs no Firebase request, and links to a real room.

After a reload, recover the current route from RTDB public state rather than assuming the initial phase. Tear down listeners when the Auth UID or room changes and suppress callbacks from stale subscriptions.

## Required verification

Use unit, Functions, RTDB Emulator, component, and real-browser tests. The browser test uses separate contexts for Host and every Participant; Display is a second page in the Host context.

Prove all of these:

- Host plus five Participants can complete the flow.
- Individual answers are unreadable before and after aggregate reveal.
- A Participant cannot advance the phase or write any demo root.
- Closing Display does not abandon the room.
- A stale `phaseVersion` is rejected.
- Concurrent duplicate commitments finalize exactly once.
- Reload preserves the finalized count and timestamp.
- Preview makes no Firebase, Auth, App Check, or Emulator request.
- Mobile controls are at least 44px, layouts do not overflow, keyboard actions work, and reduced motion preserves the result.
