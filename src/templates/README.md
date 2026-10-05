# snap-pair templates

Starter apps for the seven UX presets. Generate one with the CLI instead of
copying by hand:

```bash
npx snap-pair init                       # interactive
npx snap-pair init --yes --preset room-quiz-poll --out my-quiz
```

`snap-pair init` merges these folders into the target directory:

| Folder | What | When |
| --- | --- | --- |
| `_shared/` | Vite + React scaffold: `src/main.tsx` (host vs controller by URL), `src/snap.ts` (transport from `snap-pair.config.json`, room hooks, throttling), `src/ui.tsx` (HostHUD layout, join form, `ControllerWrapper`) | every React preset |
| `_partykit/` | `party/server.ts` relay + `partykit.json` | transport `partykit`, or `webrtc` with PartyKit signaling |
| `<preset>/` | `README.md`, `src/Host.tsx`, `src/Controller.tsx` | the chosen preset |
| `local-multi-display/` | one self-contained `index.html` (raw BroadcastChannel) | Local Multi-Display |

`package.json.tmpl` becomes `package.json` and `_gitignore` becomes
`.gitignore` (npm drops dotfiles and treats nested package.json files
specially). `{{name}}`, `{{version}}`, and `{{preset}}` are substituted.

Preset metadata (transports, pairing, message shapes, rate limits) lives in
`src/presets/index.ts`, which the CLI and SKILL.md use.

In this repository the templates are typechecked against the library source
with `npm run typecheck` (`tsconfig.templates.json` maps `snap-pair-core` to
`src/index.ts`).
