<p align="center">
  <a href="https://takaoumehara.github.io/snap-pair-skill/"><strong>📖 文档站点 →  takaoumehara.github.io/snap-pair-skill</strong></a>
  &nbsp;·&nbsp;
  <a href="https://takaoumehara.github.io/snap-pair-skill/demo.html">▶ 双标签页在线演示</a>
</p>

<p align="center">
  <a href="https://takaoumehara.github.io/snap-pair-skill/"><img src="./docs/assets/hero.svg" alt="snap-pair：手机作为控制器，大屏幕作为主机。通过二维码、六位 PIN 或广播配对；通过 Firebase、PartyKit、WebRTC 或 BroadcastChannel 实时传输。" width="100%"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/snap-pair-core"><img src="https://img.shields.io/badge/npm-snap--pair--core-cb3837?logo=npm" alt="npm: snap-pair-core"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="License: MIT">
  <img src="https://img.shields.io/badge/React-18%2B-61dafb?logo=react&logoColor=white" alt="React 18+">
  <img src="https://img.shields.io/badge/TypeScript-ready-3178c6?logo=typescript&logoColor=white" alt="TypeScript">
  <img src="https://img.shields.io/badge/transports-4-4f46e5" alt="4 transports">
  <img src="https://img.shields.io/badge/UX%20presets-7-0d9488" alt="7 UX presets">
</p>

<p align="center">
  <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.md">English</a> · <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.ja.md">日本語</a> · <b>简体中文</b> · <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.es.md">Español</a> · <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.ko.md">한국어</a>
</p>

# snap-pair

**snap-pair 是一款用于构建多屏互动 Web 体验的开发者工具（DevTool）。**
手机变成控制器，大屏幕变成主机。参与者只需在平时使用的浏览器中扫描二维码或输入六位 PIN 即可配对，无需安装任何应用，房间内的所有设备都能共享实时输入和状态。

具体的产品（问答、涂鸦墙、游戏、灯光秀、展厅等）由你自己准备，并在此基础上构建。snap-pair 负责配对、实时传输，以及手机端那些容易出错的细节。

- **配对（Pairing）：** 二维码、六位 PIN，或同一台机器上标签页之间的本地广播。
- **传输（Transport）：** Firebase Realtime Database、PartyKit、WebRTC DataChannel 或 BroadcastChannel，全部统一在同一个 `Transport` API 之下。
- **客户端工具（Client utilities）：** 屏幕常亮（wake lock）、设备方向与运动传感器（包括 iOS 的权限弹窗）、屏幕方向锁定。
- **7 种 UX 预设**，以及可直接生成可运行应用的 CLI（`npx snap-pair init`）。

npm 包名为 **`snap-pair-core`**（MIT 许可）。

> 完整的 API 参考、FAQ 和路线图请参阅[英文 README](https://github.com/takaoumehara/snap-pair-skill/blob/main/README.md#api-overview) 以及[文档站点](https://takaoumehara.github.io/snap-pair-skill/)。

---

## 快速开始

```bash
# 1. Scaffold a new app with the interactive wizard (en/ja)
npx snap-pair init

#    …or non-interactively (CI, AI agents)
npx snap-pair init --yes --preset room-quiz-poll --out my-quiz

# 2. Or add the library to an existing React app
npm i snap-pair-core
```

<details>
<summary>pnpm / yarn / bun</summary>

```bash
pnpm add snap-pair-core
yarn add snap-pair-core
bun add snap-pair-core
```

</details>

peer 依赖：`react`（18.2+）。可选：`qrcode`（用于在 `HostHUD` 中渲染二维码）、`partysocket`（更健壮的 PartyKit 套接字）和 `react-dom`（仅生成的模板会用到）。

最小的多屏应用完全不需要服务器。下面的代码通过 PIN 将同一浏览器中的两个标签页配对：

```ts
import { BroadcastChannelTransport } from 'snap-pair-core';

// Tab 1: the host (big screen)
const host = new BroadcastChannelTransport({ pairing: 'pin' });
await host.connect();
const { pairing } = await host.createRoom({ initialState: { strokes: [] } });
console.log('PIN', pairing.pin); // e.g. '042917'
host.onMessage((m) => draw(m.payload)); // m.type === 'stroke'

// Tab 2: the controller
const ctrl = new BroadcastChannelTransport({ pairing: 'pin' });
await ctrl.connect();
await ctrl.joinRoom('042917');
await ctrl.broadcast('stroke', { x: 0.42, y: 0.17 });
```

把 `BroadcastChannelTransport` 换成 `PartyKitTransport`（或 `WebRTCTransport`），同样的代码就能跨互联网运行。`FirebaseTransport` 共享房间状态，但没有临时消息（ephemeral messaging），因此不能使用 `broadcast`（见[传输方式](#传输方式及其适用场景)）。
[在两个标签页中在线体验 →](https://takaoumehara.github.io/snap-pair-skill/demo.html)

---

## 设备如何连接

<p align="center">
  <img src="./docs/assets/pairing-flow.svg" alt="配对流程：主机创建房间并显示二维码和 PIN，控制器扫码或输入 PIN 后加入，主机准入，随后实时消息双向流动。" width="100%">
</p>

| 方式 | 来宾的操作 | 支持的传输 | 辅助函数 |
|---|---|---|---|
| **二维码** | 用相机扫描；URL 中携带 `?room=` 或 `?pin=` | 所有传输 | `buildPairingJoinUrl`、`parseJoinUrl`、`useQrRenderer`、`HostHUD` |
| **六位 PIN** | 输入 `042 917`（全角数字和连字符会被自动规范化） | PartyKit、WebRTC、BroadcastChannel | `generatePin`、`normalizePin`、`isValidPin`、`verifyPin` |
| **房间代码** | 输入类似 `ABC 234` 的六位字符代码（不含易混淆字符） | 所有传输（Firebase 的默认方式） | `normalizeRoomCode`、`generateRoomCode` |
| **广播** | 在同一台机器上打开另一个标签页/窗口 | BroadcastChannel | `BroadcastChannelTransport` |

主机端只需一个组件即可显示全部信息：

```tsx
import { HostHUD, useQrRenderer } from 'snap-pair-core';

const renderQr = useQrRenderer(); // undefined if `qrcode` isn't available, so the HUD shows the code only
<HostHUD pairing={pairing} renderQr={renderQr} peerCount={peers.length} status={status} />;
```

---

## 传输方式及其适用场景

<p align="center">
  <img src="./docs/assets/architecture.svg" alt="架构：你的应用位于预设、useSnapPair、HostHUD、ControllerWrapper 和 CLI 之上，底层由三层构成：配对、传输和客户端工具。" width="100%">
</p>

<p align="center">
  <img src="./docs/assets/transport-matrix.svg" alt="各传输方式在同设备、互联网、延迟、是否需要服务器、成本和离线方面的对比。" width="100%">
</p>

| 如果你需要… | 使用 | 原因 |
|---|---|---|
| 共享状态型应用（回合制游戏、清单、大厅），需要服务端校验加入（最多 300 人）、认证和持久化 | **Firebase**（`useSnapPair` 的默认） | Cloud Functions 对每位来宾进行准入；RTDB 规则限制成员可写入的内容。仅共享状态，没有临时消息 |
| 手机通过互联网输入，房间可达数百人，部署简单 | **PartyKit** | 一个极小的 WebSocket 中继（[`examples/partykit/`](./examples/partykit/)）；房间由主机浏览器掌控 |
| 最低延迟（绘画、游戏、体感） | **WebRTC** | 点对点 DataChannel；信令通过 PartyKit（或任何支持消息的传输）进行 |
| **一台**机器上的多个窗口或显示器，可离线 | **BroadcastChannel** | 无网络、无服务器、无账号 |

四种传输都实现了相同的 `Transport` 接口（`connect`、`createRoom`、`joinRoom`、`setState`、`send`、`broadcast`、`onMessage`、`onPeers`、`onState`、`onStatus`…），因此切换只需改一行代码。当 UI 需要优雅降级时，可检查 `transport.capabilities`（`messaging`、`presence`、`serverAuthoritativeJoin`）。

> **Firebase 没有临时消息。** `FirebaseTransport` 的 `capabilities.messaging === false`，会拒绝 `send`/`broadcast`，并且 `setState` 会替换整个状态对象，多个写入方同时写入会互相覆盖。七种预设都需要流式输入，因此没有一种能在 Firebase 上运行。在 `npx snap-pair init` 中选择 Firebase 时，会提供两个选项：仅配置的 Firebase 应用（`preset: null`，通过 `useSnapPair` 共享状态），或者应用使用 Firebase、预设的实时消息使用 PartyKit。

```ts
import { PartyKitTransport, WebRTCTransport, FirebaseTransport } from 'snap-pair-core';

const party = new PartyKitTransport({ host: 'my-relay.me.partykit.dev', pairing: 'pin' });
const p2p = new WebRTCTransport({ signaling: party }); // DataChannel star, host in the middle
const fb = new FirebaseTransport({ db, auth, functions }); // server-authoritative rooms, shared state only
```

WebRTC 会自动重连（先在同一连接上进行 ICE restart，再以指数退避重新发起 offer），并把超过 16 KiB 的帧拆分成块发送（每条消息最大 1 MiB）。传入 `reconnect: false` 可关闭自动恢复。

---

## 预设

七种现成的 UX 模式。每种都有可通过 `npx snap-pair init` 生成的模板、推荐的传输方式、消息格式以及模板遵守的速率限制（`PRESETS` / `getPreset(id)` 可获取全部信息）。

<table>
  <tr>
    <td width="33%" align="center"><img src="./site/assets/img/presets/stroke-stream.svg" alt="Stroke Stream：在手机上绘画，笔画实时流向大屏幕。推荐：WebRTC 或 PartyKit。" width="100%"></td>
    <td width="33%" align="center"><img src="./site/assets/img/presets/particle-blast.svg" alt="Particle Blast：点按或滑动，在主机画布上发射粒子爆发效果。推荐：PartyKit 或 WebRTC。" width="100%"></td>
    <td width="33%" align="center"><img src="./site/assets/img/presets/type-throw.svg" alt="Type Throw：输入一个词并把它甩到共享墙上。推荐：PartyKit 或 WebRTC。" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><img src="./site/assets/img/presets/room-quiz-poll.svg" alt="Room Quiz / Poll：每个人在手机上作答，结果即时显示。推荐：PartyKit + PIN 配对。" width="100%"></td>
    <td align="center"><img src="./site/assets/img/presets/virtual-controller.svg" alt="Virtual Controller：方向键和按钮让每部手机都变成游戏手柄。推荐：WebRTC 或 PartyKit。" width="100%"></td>
    <td align="center"><img src="./site/assets/img/presets/motion-sensor.svg" alt="Motion / Sensor：利用设备方向进行倾斜、摇晃和旋转操作。推荐：WebRTC 或 PartyKit。" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><img src="./site/assets/img/presets/local-multi-display.svg" alt="Local Multi-Display：同步同一台机器上的窗口和标签页，离线也可用。推荐：BroadcastChannel。" width="100%"></td>
    <td colspan="2" valign="middle">
      <b>预设 ID</b>（用于 CLI 和 <code>snap-pair.config.json</code>）：<br><br>
      <code>stroke-stream</code> · <code>particle-blast</code> · <code>type-throw</code> · <code>room-quiz-poll</code> · <code>virtual-controller</code> · <code>motion-sensor</code> · <code>local-multi-display</code>
    </td>
  </tr>
</table>

| 预设 | id | 主机显示 | 手机发送 | 传输（**推荐**在前） | 配对（默认在前） |
|---|---|---|---|---|---|
| Stroke Stream | `stroke-stream` | 共享画布 | 指针笔画 | **WebRTC** · PartyKit · BroadcastChannel | QR · code · PIN |
| Particle Blast | `particle-blast` | 粒子场 | 点按 / 滑动 | **PartyKit** · WebRTC · BroadcastChannel | QR · PIN · code |
| Type Throw | `type-throw` | 文字墙 | 短文本 | **PartyKit** · WebRTC · BroadcastChannel | QR · PIN · code |
| Room Quiz / Poll | `room-quiz-poll` | 题目 + 实时统计 | 投票 | **PartyKit** · BroadcastChannel · WebRTC | PIN · QR · code |
| Virtual Controller | `virtual-controller` | 游戏画面 | 方向键 / 按钮状态 | **WebRTC** · PartyKit · BroadcastChannel | QR · code · PIN |
| Motion / Sensor | `motion-sensor` | 由倾斜驱动的场景 | 方向 / 运动数据 | **WebRTC** · PartyKit · BroadcastChannel | QR · code · PIN |
| Local Multi-Display | `local-multi-display` | 跨窗口的同一场景 | 窗口状态 | **BroadcastChannel** | broadcast |

所有预设都不支持 Firebase，原因见[传输方式](#传输方式及其适用场景)中的说明。

---

## CLI

```bash
npx snap-pair init                                    # interactive wizard (default command)
npx snap-pair init --yes --preset room-quiz-poll --out my-quiz
npx snap-pair init --yes --architecture managed --no-scaffold   # Firebase config only
npx snap-pair presets                                 # list the 7 presets (--json for the registry)
npx snap-pair recommend "a tilt racing game for 4 friends"
```

向导支持英语和日语（根据 `LANG` / `LC_ALL` 检测，或使用 `--lang en|ja`），并提供四种入口（用 `--path` 可跳过菜单）：

| 路径（`--path`） | 你需要回答 | 你会得到 |
|---|---|---|
| **1. 按体验**（`ux`） | 7 种预设中哪一种最合适 | 该预设，以及它支持的传输（推荐的在前） |
| **2. 按架构**（`architecture`） | 同一设备、实时、P2P 还是托管 | 一种传输，以及适合它的预设 |
| **3. 按技术栈**（`stack`） | 你已有的环境：Firebase、Cloudflare/PartyKit，或没有后端 | 围绕你的技术栈选择的传输 |
| **4. 直接描述**（`consult`） | 用英语或日语一句话描述，例如"观众在舞台大屏上投票" | 基于规则的推荐，可接受或调整 |

选择 Firebase 时，会提供仅配置的 Firebase 应用，或 Firebase + PartyKit（用于预设的实时消息）两种选项。每条路径都会写入 **`snap-pair.config.json`**，并生成 Vite + React 模板（主机和控制器在同一个应用中，按 URL 区分）；传输需要时还会生成 PartyKit 中继（`party/server.ts`）：

```json
{
  "$schema": "./node_modules/snap-pair-core/dist/config.schema.json",
  "version": 1,
  "preset": "room-quiz-poll",
  "transport": "partykit",
  "pairing": "pin",
  "locale": "en",
  "maxPlayers": 300,
  "partykit": { "host": "", "party": "main" }
}
```

| 参数 | 含义 |
|---|---|
| `--preset <id\|none>` | 7 个预设 id 之一，或 `none` |
| `--transport <t>` | `broadcast` \| `partykit` \| `webrtc` \| `firebase` |
| `--pairing <m>` | `qr` \| `code` \| `pin` \| `broadcast` |
| `--architecture <a>` | `same-device` \| `realtime` \| `p2p` \| `managed` |
| `--stack <s>` | `firebase` \| `cloudflare` \| `none` |
| `--describe <text>` | `consult` 路径使用的自由描述 |
| `--out <dir>` | 输出目录（默认：`./snap-pair-<preset>`） |
| `--no-scaffold`, `--force` | 只写配置；覆盖已有文件 |
| `-y, --yes` | 接受所有默认值（非交互） |
| `--json` | 在 stdout 输出 JSON 结果（`config`、`files`、`nextSteps`） |
| `--lang <en\|ja>` | 语言 |

随时可以重新运行该命令来修改选择。

---

## 面向所有人（非工程师）

**这是什么？** 一种能让许多人的手机瞬间加入同一块共享屏幕的方法。每个人只需在自己平时使用的浏览器中扫描二维码（或输入一个简短代码），无需下载应用，手机就会成为同一个实时同步体验的一部分。适用于活动、场馆、课堂、直播、展厅和展览。

以下三条路径彼此独立，不是同一流程中的步骤。选择与你现在想做的事情相符的那一条即可。

### 路径 A：只想看看它能不能跑起来

- **现在就在浏览器里试：** 在两个标签页中打开[在线演示](https://takaoumehara.github.io/snap-pair-skill/demo.html)。一个作为主机并显示 PIN，在另一个中输入该 PIN 即可开始绘画。无需任何设置。
- **在两部手机之间试：** 下载 [`examples/snap-pair-lite.html`](./examples/snap-pair-lite.html) 并打开，用第二台设备扫描二维码。这是一个运行在免费 Firebase Spark 方案上的固定井字棋演示，无需信用卡（见 [`examples/README.md`](./examples/README.md)）。

### 路径 B：让 AI 帮我构建自己的应用

你**不需要**下载或克隆本仓库。只需连接两个小工具（MCP 服务器），并让 AI 从网上读取本项目的构建说明即可。你需要一个能够运行命令并获取网页内容的 AI 编程工具（Claude Code、Cursor、Codex、Gemini CLI 等）。

1. 在任意文件夹（空文件夹也可以）中打开 AI 工具的对话。
2. 将以下内容原样粘贴（请保持英文原文）：

   ```
   Fetch https://raw.githubusercontent.com/takaoumehara/snap-pair-skill/main/SKILL.md
   and use it as your build instructions.

   Connect these two MCP servers if they aren't connected yet:
   - firebase: npx -y firebase-tools@latest mcp
   - snap-pair-provisioner: npx -y snap-pair-provisioner

   Then help me build: [describe what you want, e.g. "a live quiz game where
   guests join by QR code and answer on their phones"].
   ```

3. 逐一回答 AI 提出的问题。它会询问 Firebase 使用哪个谷歌账号，并在某个时刻显示一个一次性登录链接。出于账号安全考虑，这次点击被有意设计为唯一的人工步骤。

如果你的工具无法获取网页，只需下载 [`SKILL.md`](./SKILL.md)，把其内容粘贴到对话中即可。

### 路径 C：直接使用源代码

`git clone https://github.com/takaoumehara/snap-pair-skill.git` 后运行 `npm install` 和 `npm test`，然后阅读英文 README 的 API 概览和 [`docs/`](./docs/) 中的设计说明。

---

## Firebase 说明

仅 Firebase 传输需要。PartyKit、WebRTC 和 BroadcastChannel 完全不使用 Firebase。

- **Firebase 模拟器：** 在你自己的电脑上运行，**无需信用卡**，仅限本地。适合学习和实验。
- **Spark 方案（免费）：** **无需信用卡**，支持公开站点，但 Realtime Database 有**最多 100 个并发连接**的上限，且**无法部署 Cloud Functions**。因此只能使用 Lite 模式，或选择其他传输。
- **Blaze 方案（按使用量付费）：** 安全模式（服务端校验房间）所必需，**需要绑定信用卡**。免费额度依然保留，小型活动通常不会产生费用。请务必在 Firebase 控制台中**设置预算提醒**（提醒只会通知，不会强制封顶）。

## 安全说明

- **配对代码只用于定位房间，并不是密码。** 请把二维码、房间代码和 PIN 视为"会合标识"。
- **Firebase（安全模式）** 以服务端为准：Cloud Functions 创建房间并准入参与者，RTDB 规则只允许已准入成员读取或更新范围受限的字段。
- **PartyKit、WebRTC 和 BroadcastChannel** 是以主机为准（host-authoritative）的中继传输：服务端不负责准入（`capabilities.serverAuthoritativeJoin === false`）。请使用 `admit(peer)` 和 `maxPlayers` 控制加入。
- 六位 PIN 只有 10⁶ 种取值。在公开中继上请添加速率限制（见 [`examples/partykit/`](./examples/partykit/)），且不要仅凭 PIN 保护敏感内容。

---

## 更多文档

完整的 **API 参考**、**FAQ** 和**路线图**请参阅[英文 README](https://github.com/takaoumehara/snap-pair-skill/blob/main/README.md#api-overview) 和[文档站点](https://takaoumehara.github.io/snap-pair-skill/)。

## 许可协议

MIT —— 详见 [LICENSE](./LICENSE)。
