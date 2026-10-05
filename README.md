# snap-pair-core

**English** · [日本語](https://github.com/takaoumehara/snap-pair-skill/blob/main/README.ja.md) · [简体中文](https://github.com/takaoumehara/snap-pair-skill/blob/main/README.zh-CN.md) · [Español](https://github.com/takaoumehara/snap-pair-skill/blob/main/README.es.md) · [한국어](https://github.com/takaoumehara/snap-pair-skill/blob/main/README.ko.md)

Pair phones and browsers with a QR code or a six-character code, then share
live state across every device in the room. No app install. React hook on the
client; Firebase Auth + Cloud Functions + Realtime Database on the server.

This repository is the **open engine** (MIT). It is intentionally generic — you
bring the product (the game, the vote, the checklist, the light show) and build
it on top.

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

### What do you want to do? Pick one

There are three different ways to use this repository. **Pick the one that
matches what you actually want right now** — don't do more than one, they're
not steps of the same process, they're separate paths.

| | **A. Just see it work** | **B. Have an AI build my own app** | **C. Work with the source code** |
|---|---|---|---|
| **For** | "I want to see it running in 2 minutes" | "I want a custom app, but I don't want to write or manage code myself" | "I'm an engineer, I want to read/modify the actual source, or contribute" |
| **What you install** | Nothing | One AI coding tool (you probably already have it) | One AI coding tool **and** Git/Node.js familiarity |
| **What you download** | One HTML file | **Nothing** — the AI connects directly, no repo download | The whole repository (`git clone` or ZIP) |
| **Credit card needed?** | No | Depends on what you build — see the Firebase table below | Depends on what you build |
| **Can you share a link with others?** | Yes (same room, same Wi-Fi/network) | Yes, once deployed | Yes, once deployed |
| **Jump to** | [Path A](#path-a-just-see-it-work-2-minutes-no-setup) | [Path B](#path-b-have-an-ai-build-your-own-app-no-download-needed) | [Path C — "For engineers"](#for-engineers) |

---

### Path A: Just see it work (2 minutes, no setup)

1. Download this one file: [`examples/snap-pair-lite.html`](./examples/snap-pair-lite.html)
2. Open it in your browser (double-click it).
3. Scan the QR code with a second phone or browser.

That's it — no install, no account, no credit card. This is a fixed demo (a
tic-tac-toe two phones can play), not a custom app — for that, go to Path B.

---

### Path B: Have an AI build your own app (no download needed)

**This is the important part people usually get confused about:** you do
**not** need to download this repository, clone it, or unzip anything for
this path. Connecting to two small tools (called MCP servers) is enough —
exactly like connecting to any other MCP server. The one extra thing beyond a
normal MCP setup is telling the AI to read this project's build instructions
directly from the web, so it knows the correct, safe way to build a snap-pair
app.

**What you need first:** one AI coding tool that can run commands and fetch
web pages for you — Claude Code, Cursor, Codex, Gemini CLI, or similar. If you
don't have one yet, see ["I don't have an AI coding tool yet"](#i-dont-have-an-ai-coding-tool-yet)
below.

**Step 1 — open a chat in your AI tool**, in any project folder (a brand-new
empty folder is fine — this will become your app).

**Step 2 — type this into the chat, as-is:**

```
Fetch https://raw.githubusercontent.com/takaoumehara/snap-pair-skill/main/SKILL.md
and use it as your build instructions.

Connect these two MCP servers if they aren't connected yet:
- firebase: npx -y firebase-tools@latest mcp
- snap-pair-provisioner: npx -y snap-pair-provisioner

Then help me build: [describe what you want — e.g. "a live quiz game where
guests join by QR code and answer on their phones"].
```

**Step 3 — answer the AI's questions as they come up.** It will typically ask:
which Google account to use for Firebase, and at some point it will show you
a one-time browser link to click to sign in to Firebase (this single click is
the only manual step in the whole process — it cannot be automated, by design,
for your account's safety).

If your AI tool cannot fetch web pages, ask it to say so — then fall back to
downloading just the one `SKILL.md` file from this repository and pasting its
contents into the chat instead of the fetch instruction above.

#### I don't have an AI coding tool yet

Pick **one** (you only need one):
- **[Cursor](https://cursor.com)** — the simplest option: a full code editor
  with AI chat built in. Download and install like any other app.
- **Claude Code** — install the extension from the VS Code marketplace if you
  already use VS Code, or the standalone CLI from
  [claude.com/code](https://claude.com/code).
- **Codex** or **Gemini CLI** — if you already use OpenAI or Google's coding
  tools.

Once installed, open it, open (or create) a folder for your project, and go to
Step 1 above.

---

### Firebase setup: what it means for Path B

At some point in Path B, the AI will need to connect a **Firebase** project
(Google's service that runs the realtime backend). Which option applies
depends on whether you want to **learn/build privately** or **let other
people actually use it**:

| Your goal | Use | Credit card? | Can others join by URL? |
|---|---|---|---|
| Learn, experiment, let a child build & test | **Firebase Emulator** (runs on your computer) | **No card needed** | No — local only |
| Let real people join from their own phones | **Firebase Blaze plan** | **Yes, a credit card is required** | Yes |

- **Learning / building privately → Emulator.** It runs entirely on your own
  computer, for free, with **no credit card**. Perfect for trying things and
  for kids learning to build with AI. The only limit: it's local, so you can't
  send other people a link.
- **Going live with real guests → Blaze plan.** To publish the backend
  (Cloud Functions) to the internet, Firebase requires the **Blaze
  (pay-as-you-go) plan, which needs a credit card on file.** The free
  allowance is large (about 2 million function calls per month are free), so a
  small event usually costs nothing — but **the card is required to turn it
  on.** Always set a budget alert in the Firebase console.
- **Why is a card needed at all?** For safety, snap-pair checks room creation
  and joining on the server (Cloud Functions), not in the browser. Firebase
  does not allow Cloud Functions to be published on the free (Spark) plan — only
  on Blaze. That's a Firebase rule, not a snap-pair limitation. If you don't
  want to add a card, you can still do everything except share a public link by
  using the Emulator.

The two MCP servers from Step 2 above create the project, enable what's
needed, and write your `.env` for you — you don't click through the Firebase
console by hand. See
[`SKILL.md`](./SKILL.md#firebase-setup-mcp-automation-vs-manual) for the full
breakdown of what's automatic and what stays a manual, one-time step.

---

### Path C: Work with the source code (engineers)

This is for reading, modifying, or contributing to the actual source — see
the **["For engineers"](#for-engineers)** section below. This path does
involve downloading the repository (`git clone` or "Download ZIP" from
GitHub), because you're working with the code itself, not just asking an AI
to generate a new app from instructions.

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

## Automated dependency updates (AI-assisted)

- [`.github/dependabot.yml`](./.github/dependabot.yml) opens weekly update PRs
  for npm in `/`, `/functions` and `/tools/snap-pair-provisioner`, plus GitHub
  Actions. Minor and patch updates are grouped into one PR per directory; major
  updates get their own PR. All of them are labeled `dependencies`.
- [`.github/workflows/ai-update-helper.yml`](./.github/workflows/ai-update-helper.yml)
  runs [`scripts/ai-update-helper.mjs`](./scripts/ai-update-helper.mjs):
  - **On Dependabot PRs** (only when both the actor and the PR author are
    `dependabot[bot]`), it diffs `package.json` / `package-lock.json` between
    base and head (falling back to the PR body), fetches GitHub release notes
    or `CHANGELOG.md` for each package, finds `import` / `require` usages with
    `git grep`, and asks Gemini for a per-package summary, an impact verdict
    (Not affected / Possibly affected / Affected) and proposed `diff`s. The
    result is one PR comment that is updated in place on every push.
  - **Weekly (Mondays 06:00 UTC, or manually via "Run workflow")**, it
    compares each `package-lock.json` with the npm registry's latest versions
    (no `npm install` needed) and updates a single open issue titled
    "AI dependency update report".
  - If the Gemini API fails, it still posts the plain package table.

### Setup

1. Create a Gemini API key in [Google AI Studio](https://aistudio.google.com/apikey).
2. Add it as `GEMINI_API_KEY` in **both** places under
   *Settings → Secrets and variables*:
   - **Actions** (used by the weekly run), and
   - **Dependabot** (workflow runs triggered by Dependabot can only see
     Dependabot secrets).

   With the GitHub CLI:

   ```bash
   gh secret set GEMINI_API_KEY
   gh secret set GEMINI_API_KEY --app dependabot
   ```

3. Optional: set a repository **variable** `GEMINI_MODEL` (*Settings → Secrets
   and variables → Actions → Variables*) to choose the model. The default is
   `gemini-3.5-flash`. Gemini 1.5 Flash is retired, so don't use it.

Without `GEMINI_API_KEY` the script logs a notice and exits successfully. The
workflow never fails just because the key is missing.

**Permissions.** The workflow sets `permissions: {}` at the top level and grants
each job only what it needs: `contents: read` + `pull-requests: write` for the
PR job, and `contents: read` + `issues: write` for the weekly job. The API key
goes in the `x-goog-api-key` header, never in the URL or the logs.

**Run locally.** This prints the Markdown instead of writing to GitHub:

```bash
# Weekly report (queries the npm registry; without a key it prints only the table)
node scripts/ai-update-helper.mjs --dry-run
# PR analysis for a local commit range
node scripts/ai-update-helper.mjs --dry-run --mode pr --base origin/main --head HEAD
```

> **Review AI suggestions before merging.** The verdicts and diffs are
> generated by an LLM from release notes and grep results. They can be
> incomplete or wrong. Treat them as a starting point, and rely on CI and your
> own review.

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
