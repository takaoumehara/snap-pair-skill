# snap-pair-provisioner (local MCP)

Fills the two gaps the official Firebase MCP does not cover for snap-pair:

- `enable_snap_pair_services` — enable Anonymous Auth + create the default RTDB instance (Spark-free).
- `inject_env_variables` — read the Web SDK config and merge-write it into a `.env`.

Use **alongside** the official Firebase MCP, which handles project creation, rules deploy, and
SDK config retrieval.

## Prerequisites
- `firebase-tools` on PATH (`npm install -g firebase-tools`), and `firebase login` done once
  (browser OAuth — cannot be scripted).
- Blaze / reCAPTCHA are out of scope (only needed for Cloud Functions / App Check). A brand-new
  project's Authentication needs one free manual click of "Get started" in the Firebase console
  before Anonymous Auth can be enabled — `enable_snap_pair_services` detects this and tells you.

## Install and register (npm — recommended)

```bash
claude mcp add snap-pair-provisioner -- npx -y snap-pair-provisioner
claude mcp add firebase -- npx -y firebase-tools@latest mcp
```

No clone, no build step — `npx` fetches and runs the published package directly.

## Local development (build from source)

```bash
npm install && npm run build
claude mcp add snap-pair-provisioner -- node "$(pwd)/dist/index.js"
```
