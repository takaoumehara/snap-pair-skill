# snap-pair refactor — Phase 3 plan

Status: implemented on `feat/phase3-cli-presets` (stacked on Phase 2,
`docs/plan-phase2.md`). The package version stays 1.0.1. Nothing was
published or pushed.

## Goal

Phase 3 turns the library into a DevTool. A developer (or an AI agent) runs
`npx snap-pair init` and picks one of seven UX presets. The CLI picks a
transport and pairing method for it, explains the trade-offs and costs, and
scaffolds a runnable app. It also covers what Phase 2 left open: `useSnapPair`
on any transport, a controller-side wrapper, i18n, WebRTC recovery and
chunking, and a real build with an `exports` map.

## Scope

| Area | Files | State |
| --- | --- | --- |
| CLI | `src/cli/index.ts` (bin entry), `src/cli/main.ts` (args, commands), `src/cli/wizard.ts` (flows, scaffolding) | Implemented |
| Config | `src/cli/config.ts`: `SnapPairConfig`, `CONFIG_JSON_SCHEMA` (draft-07, shipped as `dist/config.schema.json`), `validateConfig`, `buildConfig` | Implemented |
| Recommender | `src/cli/recommend.ts`: en/ja keyword scoring, transport hints, head-count rule | Implemented |
| Presets | `src/presets/index.ts`: seven descriptors and helpers | Implemented |
| Templates | `src/templates/{_shared,_partykit,<preset>}`; `tsconfig.templates.json`, `types/templates-shims.d.ts` | Implemented; two generated apps built with real dependencies (see Verification) |
| i18n | `src/i18n/index.ts`, `src/i18n/locales/{en,ja}.json` | Implemented (CLI, HostHUD, ControllerWrapper) |
| Controller UI | `src/components/ControllerWrapper.tsx`, `src/client/fullscreen.ts` | Implemented |
| Hook on any transport | `src/core/useSnapPair.ts` (dispatcher + Firebase hook), `src/core/useTransportSnapPair.ts` | Implemented |
| WebRTC hardening | `src/transports/webrtc.ts`, `src/transports/chunking.ts` | Reconnect + chunking implemented; see Remaining |
| Packaging | `tsup.config.ts`, `package.json` | Implemented |
| Docs | `SKILL.md` (decision table, CLI, config), README (CLI section only), CHANGELOG | Implemented |

## Key design decisions

1. **One wizard code path for humans, CI, and agents.** Every question has a
   flag, `--yes` takes each default, and `--json` prints a machine-readable
   result on stdout while all human output goes to stderr. Prompts read stdin
   through the `node:readline/promises` async iterator. That iterator buffers
   lines, so piped answers are never lost (tests drive whole interactive
   sessions this way). No new runtime dependency was added.
2. **Four entry paths converge on (preset, transport, pairing).** By
   experience → preset → its supported transports. By architecture or stack →
   transport → presets that support it, recommended first. Consult → the
   recommender, then accept or adjust. Each transport option prints a summary,
   pros, cons, and a cost line with free-tier notes from the locale files.
3. **Firebase fits no preset, and the CLI says so.** All seven presets stream
   ephemeral input (`send`/`broadcast`), but `FirebaseTransport` has no
   messaging (Phase 1, decision 3), and `writeState` replaces the whole state
   object, so concurrent voters would clobber each other. Picking Firebase
   offers two options: a config-only Firebase app (`preset: null`, for
   shared-state apps through the default `useSnapPair`), or Firebase for the
   app plus PartyKit for the preset's realtime messages. `validateConfig`
   enforces the same rules.
4. **Rule-based recommender.** Each preset carries en/ja keywords. English
   matches on word boundaries (plus plain plurals); Japanese matches
   substrings, since it has no spaces. Generic words ("game", "ゲーム",
   "操作") weigh 0.4, so "tilt racing game" lands on Motion/Sensor. Transport
   hints (latency, offline, Cloudflare, Firebase, scale) choose among the
   preset's supported transports. Unsupported hints are explained, e.g. why
   Firebase isn't used for messaging. Rooms over 16 people move off the
   WebRTC star. With no match it falls back to Room Quiz/Poll on PartyKit and
   says so.
5. **Templates are composed, not duplicated.** `snap-pair init` copies
   `_shared` (Vite + React, host vs controller by URL, transport from
   `snap-pair.config.json`), then `_partykit` when a relay is needed, then the
   preset folder. `package.json.tmpl` and `_gitignore` are renamed (npm drops
   dotfiles), and `{{name}}`/`{{version}}`/`{{preset}}` are substituted.
   Templates import `snap-pair-core` by name, so the main `tsconfig.json`
   excludes them. `tsconfig.templates.json` maps the package to
   `src/index.ts` and uses `rootDirs` to merge `_shared/src` with each preset
   the way the CLI does on disk. `npm run typecheck` runs both. The template
   relay is `examples/partykit/server.ts` with a 320-connection cap (a test
   keeps them in sync).
6. **Template security defaults.** Controllers send input with
   `sendToHost` (`to: hostId`), so other phones never receive it and a WebRTC
   host does not forward it. Hosts are the only state writers
   (`allowGuestState: false`). Hosts clamp and validate every payload. The
   quiz keeps the latest vote per peer id.
7. **Hook dispatch instead of a rewrite.** `useSnapPair` checks
   `options.transport` once (switching modes later throws a clear error) and
   calls either the untouched Firebase hook or `useTransportSnapPair`. The
   transport hook returns the identical shape: `dbConnected`/`authReady`
   follow the transport status, `localGuest.id` becomes the transport's peer
   id, and `updateOwnPlayer`/`updateRoomStatus` call `updateSelf`/
   `setRoomStatus` when the transport has them. An instance stays owned by
   the caller (the hook subscribes only); a factory is owned by the hook and
   disconnected on unmount. The 16 existing hook tests run unchanged.
8. **WebRTC recovery in two stages.** When a guest connection goes `failed`,
   the guest restarts ICE on the same connection (`restartIce()` plus an
   `iceRestart` offer flagged `restart`). The host renegotiates on the
   existing connection and keeps the peer for `iceRestartGraceMs`. If the
   channel closes, or the restart doesn't recover within `connectTimeoutMs`,
   the guest builds a new connection and re-offers with exponential backoff
   (500 ms doubling to 8 s, 5 attempts). Once it opens, the relay engine
   re-sends `hello` and the host re-admits the guest. Every signal carries a
   per-connection `session` id, so answers and candidates for a replaced
   connection are ignored. Session-less Phase 2 peers still interoperate.
   `reconnect: false` restores the Phase 2 behavior.
9. **Chunking at the link layer.** Frames larger than `maxMessageBytes`
   (16 KiB, a size every browser accepts; lowered further if
   `pc.sctp.maxMessageSize` is smaller) are split into
   `{"sp":"chunk",id,i,n,d}` JSON frames. They never split a surrogate pair,
   and each piece's encoded size is checked, so control characters can't
   overflow. Per-channel `Reassembler`s cap total size (1 MiB), pending
   messages (16), and age (10 s). Senders refuse frames above the cap with a
   `TransportError`. Chunks can't be confused with wire frames: chunks start
   with `{"sp":"chunk"`, wire frames start with `{"t":`. The host still pins
   reassembled frames to their channel.
10. **Packaging.** tsup builds `dist/` as ESM (`.js`) and CJS (`.cjs`) with
    `.d.ts`/`.d.cts`, with code splitting, so subpath entries
    (`./transports/*`, `./hooks/useSnapPair`) share classes with `.` (checked
    in both formats). The CLI is one ESM file with a shebang. The build
    copies `src/templates` to `templates/` (gitignored, shipped) and writes
    the config schema. `exports` keeps the old deep imports
    `snap-pair-core/src/hooks/useSnapPair(.ts)` working, and `typesVersions`
    covers TypeScript's `node10` resolution. `react` is a peer;
    `react-dom` is an optional peer (only templates use it). `firebase` stays
    a dependency because the default hook path imports it at module load.

## Verification

- `npm run typecheck` (library + templates): clean.
- `npm test`: 30 files (29 passed, 1 skipped: the emulator suite).
  397 tests passed, 2 skipped. Phase 2 had 263 passing.
- `npm run build`: ESM + CJS + d.ts for 7 entries, plus `dist/cli/index.js`
  and `dist/config.schema.json`.
- `npm publish --dry-run`: 99 files, 228.4 kB packed, 794.9 kB unpacked. The
  tarball contains only `dist/`, `templates/`, `references/`, `README*`,
  `LICENSE`, `CHANGELOG.md`, `SKILL.md`, and `package.json`: no tests,
  `functions/`, `tools/`, `examples/`, or `.claude`. `prepublishOnly`
  (typecheck, test, build) runs during the dry run.
- `node dist/cli/index.js init --yes --preset room-quiz-poll --out /tmp/sp-cli-test --json`
  writes 17 files and prints a JSON result.
- End-to-end: the packed tarball was installed into two generated apps
  (`room-quiz-poll` on PartyKit; `motion-sensor` on WebRTC, Japanese UI).
  Each app's own `tsc --noEmit && vite build` succeeds against the real
  `partysocket`, `qrcode`, and React types.
- The dist entry points were checked with Node: ESM and CJS `import`/
  `require` of `.`, `./hooks/useSnapPair`, `./src/hooks/useSnapPair`,
  `./src/hooks/useSnapPair.ts`, `./transports/*`, and `./config.schema.json`,
  with shared class identity across entries.

### New tests (134)

| File | Tests | Covers |
| --- | --- | --- |
| `src/cli/cli.test.ts` | 23 | Arg parsing, help/version (en/ja), non-interactive scaffolds (files, token substitution, JSON output), `--no-scaffold`, Local Multi-Display, overwrite protection/`--force`, errors, managed/stack/consult paths, scripted stdin for the UX, invalid-answer, Firebase-architecture, Japanese consult, and rejected-recommendation paths, EOF, `presets`/`recommend`, every preset × transport scaffold plan, relay sync with the example. |
| `src/cli/recommend.test.ts` | 19 | Keyword matching (en boundaries, ja substrings), head counts, all seven presets in English and five in Japanese, transport hints, Firebase explanation, large-room rule, fallback, ranking. |
| `src/cli/config.test.ts` | 9 | Valid/invalid configs, nested sections, cross-field rules, schema vs validator, `buildConfig` for every preset × transport. |
| `src/presets/presets.test.ts` | 20 | Registry completeness and consistency, template files exist, Firebase exclusion, pairing/transport helpers. |
| `src/i18n/i18n.test.ts` | 13 | Key parity en/ja, placeholder parity, HUD defaults match, `t`/`tList`/fallbacks, `detectLocale` precedence (env, Intl, browser). |
| `src/components/ControllerWrapper.test.tsx` | 12 | Status (prop and transport), reconnect banner, wake lock toggle/unsupported, iOS motion grant/deny/none/unsupported, fullscreen + orientation lock, i18n and overrides. |
| `src/core/useTransportSnapPair.test.tsx` | 13 | Hook with `BroadcastChannelTransport`: connect, shape parity, create/join/state sync, `parseGameState`, host-only status, unsupported player updates, errors, PIN pairing, not-connected guard, connect failure, leave, ownership on unmount, mode switch. |
| `src/transports/chunking.test.ts` | 14 | Pass-through, byte limits for ASCII/quotes/CJK/emoji/control/mixed text, surrogate safety, reassembly order/interleaving/duplicates, malformed chunks, size cap, expiry and eviction. |
| `src/transports/webrtc.test.ts` | +6 | Re-offer and re-admission, backoff giving up, ICE restart on the same connection without a roster change, host grace-period drop, chunking end to end (incl. host forwarding under a 16 KiB SCTP limit), `maxMessageBytes`/`maxReassembledBytes`. |
| `src/components/HostHUD.test.tsx` | +4 | `locale`, overrides on top of a locale, `'auto'`, default region name. |
| `skill.test.ts` | +1 | SKILL.md lists every preset and documents the CLI and config. |

## Remaining (not done in Phase 3)

- **WebRTC:** renegotiation (adding channels or media tracks), binary
  payloads (frames are JSON text), backpressure (`bufferedAmount` /
  `bufferedamountlow`), mesh topology, host migration, and real-browser e2e
  tests (for example Playwright with two contexts and a TURN server).
  Recovery and chunking are tested against fakes only.
- **Bundle size:** the root entry's `useSnapPair` statically imports
  `firebase/auth`, so apps on non-Firebase transports still bundle it (the
  generated apps are about 560 kB minified). A Firebase-free hook entry, or
  lazy loading of the Firebase path, would fix this but changes module
  structure.
- **Templates:** checked by typecheck and production builds only. No
  automated browser run, and the PartyKit relay was not deployed. Local
  Multi-Display assumes equally sized windows. Text in Type Throw is not
  moderated (documented).
- **Firebase:** numeric PINs and a rules-scoped `rooms/$roomId/messages` path
  (see `docs/plan-phase2.md`) are still open. Until messaging exists, the CLI
  steers presets to relay transports.
- **i18n:** only `en` and `ja`. Transport error messages and the template UI
  strings (beyond HUD/ControllerWrapper) are still English-only.
- **Docs:** the README redesign and translated READMEs are left to a separate
  task, as requested. Only a minimal CLI section was added.
- **Release:** the version stays 1.0.1. The packaging changes (`exports`,
  `type: module`, dist-based `main`) warrant a minor bump (1.1.0) when
  published.
