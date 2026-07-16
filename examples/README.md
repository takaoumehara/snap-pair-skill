# Examples

## `snap-pair-lite.html` — Lite mode, no credit card, one file

A complete two-player tic-tac-toe you can play across two phones (or a phone
and a laptop). Players join one room by **QR code or a 6-character code** and
the board syncs live. It talks **directly to Firebase Realtime Database from
the browser — no Cloud Functions** — so it runs on the **free Firebase Spark
plan with no credit card**.

This is the fastest way to see snap-pair's idea working, and the ideal starting
point for kids, workshops, and AI "vibe coding."

### Run it in 4 steps

1. Create a free Firebase project (no card): <https://console.firebase.google.com>
2. Enable **Realtime Database** (test mode is fine to start).
3. Copy your web app config into `FIREBASE_CONFIG` at the top of the `<script>`.
4. Open `snap-pair-lite.html` in a browser, or host it on Vercel / Firebase
   Hosting. Send the link or QR to a friend and play.

### Workshop mode (zero setup for kids)

A host can pre-fill `FIREBASE_CONFIG` with their own Spark project. Then kids
just open the file and play — no Firebase account, no setup. Those config
values are meant to be public (every web app ships them), so sharing them is
safe. Spark allows 100 simultaneous connections, shared across everyone on
that project.

### Test locally with no project at all

Set `USE_EMULATOR = true` in the file and run the Firebase Emulator — fully
local, no billing account, no card.

### Security rules

`lite.rules.json` are deliberately open (any code-holder can write that room),
which is fine for tic-tac-toe, drawing, and party games. **Do not use Lite mode
for payments, private data, or large public events** — for that, use the
server-assisted design in the repository root (Secure mode).

## Lite vs Secure

| | Lite (this example) | Secure (repo root) |
|---|---|---|
| Backend | Browser → RTDB directly | Cloud Functions verify everything |
| Firebase plan | Spark — **no credit card** | Blaze — card required |
| Best for | Play, learning, workshops, prototypes | Events, 300-person rooms, payments |
| Security | Open (play-safe) | Server-authoritative |
