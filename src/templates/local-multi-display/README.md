# Local Multi-Display

Several windows or monitors on **one computer** show slices of one
synchronized scene: video walls, exhibitions, multi-monitor dashboards. No
server, no network, no install.

| | |
| --- | --- |
| Preset id | `local-multi-display` |
| Transport | **broadcast** (BroadcastChannel) only |
| Pairing | broadcast: every window opened with the same `?room=` joins automatically |
| Room size | 2–16 windows |

## Run

Open `index.html` in a browser (double-click it, or serve the folder with any
static server), then click **Open another window** and drag each window onto a
different monitor (press F11 for fullscreen). Windows order themselves by join
time; the first one is the leader and slice 1. Press **H** to hide the toolbar.

## How it works

`index.html` is self-contained and uses `BroadcastChannel` directly:

```ts
{ t: 'hello', id, joinedAt }      // announce + heartbeat every 500 ms (timeout 2 s)
{ t: 'bye', id }                  // window closing
{ t: 'tick', scene, startedAt }   // leader -> all; any window may change the scene
```

All windows share the machine's clock, so the leader sends only the scene and
its start time (never frames), and every window renders its own slice locally.

## Limits

- Same browser profile and same origin only. Browsers differ in whether
  `file://` pages count as one origin; if windows opened from the file don't
  see each other, serve the folder (`npx serve .`) and use the http URL.
- Assumes equally sized windows. Store each window's width in `hello` for
  uneven walls.
- To add phones or other machines, switch to a React template with
  `PartyKitTransport` (`npx snap-pair init`). For tests, the library's
  `BroadcastChannelTransport` implements the full room protocol over the same
  API.
