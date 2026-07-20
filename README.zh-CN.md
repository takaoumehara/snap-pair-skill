# snap-pair-core

[English](https://github.com/takaoumehara/snap-pair-core/blob/main/README.md) · [日本語](https://github.com/takaoumehara/snap-pair-core/blob/main/README.ja.md) · **简体中文** · [Español](https://github.com/takaoumehara/snap-pair-core/blob/main/README.es.md) · [한국어](https://github.com/takaoumehara/snap-pair-core/blob/main/README.ko.md)

通过扫描二维码或输入六位代码，将手机和浏览器配对，即可在房间内的所有设备之间实时共享状态。无需安装应用。客户端使用 React hook，服务端由 Firebase Auth + Cloud Functions + Realtime Database 构成。

本仓库是一个**开源引擎**（MIT 许可）。它被有意设计得足够通用——具体的产品（游戏、投票、清单、灯光秀等）由你自己准备，并在此基础上构建。

---

## 面向所有人（非工程师）

**这是什么？**
一种能让许多人的手机瞬间加入同一个共享屏幕的方法。每个人只需用自己平时使用的浏览器扫描二维码（或输入一个简短代码）——无需下载应用——他们的手机就会成为一个实时同步体验的一部分。

**适合谁使用？**
- 举办**活动、场馆、课堂、直播、展厅或展览**，希望观众用自己的手机参与其中的人。
- 为他们打造这些体验的**工程师和 AI 开发者**。

**可以用它构建什么？**
- 大屏幕上的实时投票、民意调查和问答
- 团队清单以及"全员准备就绪"确认
- 观众互动反应、竞猜游戏、协作绘画
- 全场手机同步灯光秀
- 任何"一块共享屏幕 + 许多手机 + 即时结果"的场景

### 你想做什么？请选择一项

使用本仓库大致有三种不同方式。**请选择与你现在真正想做的事情相匹配的那一种**——这三种不是同一流程中的步骤，而是彼此独立的路径。不需要三种都做。

| | **A. 只想看看它能不能跑起来** | **B. 让 AI 帮我构建自己的应用** | **C. 直接使用源代码** |
|---|---|---|---|
| **适合** | "我想在 2 分钟内看到它运行起来" | "我想要一个定制应用，但不想自己写代码或维护代码" | "我是工程师，想阅读/修改实际源代码，或参与贡献" |
| **需要安装什么** | 什么都不用 | 一个 AI 编程工具（你可能已经有了） | 一个 AI 编程工具 **加上** Git/Node.js 相关知识 |
| **需要下载什么** | 一个 HTML 文件 | **什么都不用**——AI 直接连接即可，无需下载仓库 | 整个仓库（`git clone` 或 ZIP） |
| **需要信用卡吗？** | 不需要 | 取决于你构建的内容——见下方 Firebase 表格 | 取决于你构建的内容 |
| **能否把链接分享给其他人？** | 能（同一房间、同一网络内） | 能（部署后） | 能（部署后） |
| **详情** | 见下方"路径 A" | 见下方"路径 B" | 见下方"面向工程师"章节 |

---

### 路径 A：只想看看它能不能跑起来（2 分钟，无需任何准备）

1. 下载这一个文件：[`examples/snap-pair-lite.html`](./examples/snap-pair-lite.html)
2. 在浏览器中打开它（双击即可）。
3. 用第二台手机或浏览器扫描二维码。

就是这么简单——无需安装、无需账号、无需信用卡。不过这是一个固定的演示（一个两台手机可以玩的井字棋），不是你专属的应用——如果想要专属应用，请前往路径 B。

---

### 路径 B：让 AI 帮我构建自己的应用（无需下载任何东西）

**这是大家最容易误解的一点：** 走这条路径，你**完全不需要**下载本仓库、克隆它，或解压任何文件。只需连接两个小工具（称为 MCP 服务器）即可——这与连接任何其他 MCP 服务器完全相同。与普通 MCP 连接唯一不同的一点是：让 AI 直接从网上读取本项目的构建说明，这样它才知道如何正确、安全地构建 snap-pair 应用。

**首先你需要：** 一个能够运行命令并获取网页内容的 AI 编程工具——Claude Code、Cursor、Codex、Gemini CLI 或类似工具。如果你还没有，请参考下方["我还没有 AI 编程工具"](#我还没有-ai-编程工具)。

**第 1 步 —— 在你的 AI 工具中打开一个对话**，可以是任意项目文件夹（一个全新的空文件夹也可以——它将成为你的应用所在目录）。

**第 2 步 —— 原样将以下内容粘贴到对话中：**

```
获取 https://raw.githubusercontent.com/takaoumehara/snap-pair-core/main/SKILL.md
并将其作为构建说明使用。

如果尚未连接，请连接以下两个 MCP 服务器：
- firebase: npx -y firebase-tools@latest mcp
- snap-pair-provisioner: npx -y snap-pair-provisioner

然后帮我构建：[描述你想要的东西——例如"一个实时问答游戏，来宾通过扫描二维码加入
并用手机作答"]。
```

**第 3 步 —— 逐一回答 AI 提出的问题。** 它通常会询问要为 Firebase 使用哪个谷歌账号，随后会在某个时刻显示一个一次性的浏览器链接，供你点击登录 Firebase（整个流程中唯一需要人工操作的就是这一次点击——出于账号安全考虑，这一步被有意设计为无法自动化）。

如果你的 AI 工具无法获取网页内容，请让它告诉你——然后改为仅下载本仓库中的 `SKILL.md` 文件，并将其内容粘贴到对话中，以替代上面"获取"这条指令。

#### 我还没有 AI 编程工具

请**选择一个**（只需要一个即可）：
- **[Cursor](https://cursor.com)** —— 最简单的选择：一款内置 AI 对话功能的完整代码编辑器。像安装其他普通应用一样下载安装即可。
- **Claude Code** —— 如果你已经在用 VS Code，可以从 VS Code 市场安装扩展；也可以从 [claude.com/code](https://claude.com/code) 获取独立的命令行版本。
- **Codex** 或 **Gemini CLI** —— 如果你已经在使用 OpenAI 或谷歌的编程工具。

安装完成后，打开它，打开（或新建）一个项目文件夹，然后回到上面的第 1 步继续。

---

### Firebase 设置：对路径 B 意味着什么

在路径 B 的某个阶段，AI 需要连接一个 **Firebase** 项目（谷歌提供的、运行实时后端的服务）。具体选哪种方式取决于你是**仅想私下学习/构建**，还是**想让其他人真正使用它**：

| 你的目标 | 使用 | 需要信用卡吗？ | 其他人能否通过链接加入？ |
|---|---|---|---|
| 学习、实验，或让孩子构建和测试 | **Firebase 模拟器**（在你自己的电脑上运行） | **无需信用卡** | 否——仅限本地 |
| 让真实用户从自己的手机加入 | **Firebase Blaze 方案** | **需要，必须绑定信用卡** | 是 |

- **私下学习/构建 → 使用模拟器。** 它完全在你自己的电脑上运行，免费，且**无需信用卡**。非常适合尝试新想法，也适合让孩子学习用 AI 构建应用。唯一的限制是：它只能在本地运行，你无法把链接发给其他人。
- **面向真实来宾正式上线 → 使用 Blaze 方案。** 要将后端（Cloud Functions）发布到互联网上，Firebase 要求使用 **Blaze（按使用量付费）方案，该方案需要绑定信用卡。** 免费额度相当充裕（每月约 200 万次函数调用免费），因此小型活动通常不会产生费用——但**必须绑定信用卡才能开通该功能。** 请务必在 Firebase 控制台中设置预算提醒。
- **为什么一定需要信用卡？** 出于安全考虑，snap-pair 在服务端（Cloud Functions）而非浏览器端检查房间的创建与加入。Firebase 不允许在免费的（Spark）方案下发布 Cloud Functions——只有 Blaze 方案才可以。这是 Firebase 自身的规则，而不是 snap-pair 的限制。如果你不想绑定信用卡，除了无法分享公开链接之外，使用模拟器仍然可以完成一切操作。

上面第 2 步中的两个 MCP 服务器会代替你创建项目、启用所需功能，并写入你的 `.env` 文件——你不必手动在 Firebase 控制台里逐个点击操作。关于哪些部分是自动完成的、哪些仍需手动一次性操作，完整说明见 [`SKILL.md`](./SKILL.md#firebase-setup-mcp-automation-vs-manual)。

---

### 路径 C：直接使用源代码（面向工程师）

这条路径适合阅读、修改实际源代码，或参与贡献——请参见下方**"面向工程师"**章节。这条路径确实需要下载仓库（`git clone` 或在 GitHub 上点击"Download ZIP"），因为你要处理的是代码本身，而不只是让 AI 根据说明生成一个新应用。

---

## 面向工程师

`snap-pair-core` 是一个基于 React / Firebase Realtime Database 的基础框架，用于通过二维码或六位代码临时配对浏览器，并为最多 300 名参与者的房间提供在线状态（presence）和轻量级共享状态。

生产环境采用服务端辅助（server-assisted）架构。Firebase Auth 识别每个浏览器，Cloud Functions 负责创建房间和准入参与者，RTDB 安全规则仅允许已准入的房间成员订阅或更新范围受限的字段。简短的配对代码只是用来定位房间，**并非授权凭证**。

### 架构

- **React 18 hook**（`src/hooks/useSnapPair.ts`）：认证就绪状态、房间订阅、自身在线状态、范围受限的状态更新，以及离开处理逻辑。
- **类型定义**（`src/types/index.ts`）：`SnapPlayer`、`SnapRoom` 及配对相关类型。
- **可调用的 Cloud Functions**（`functions/src/`）：`createSnapRoom`、`joinSnapRoom`，以及定时执行的 `cleanupExpiredData`。
- **安全规则**（`database.rules.json`）：基于成员身份的读取限制，以及范围受限的客户端写入，不允许对整个房间进行大范围写入。

房间的创建和加入均通过 `functions/` 中的 Admin SDK 路径完成。浏览器无法读取配对代码记录、直接创建房间，或写入成员身份/容量相关的记录。

### React 使用方式

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

在调用 `createRoom(initialState)` 或 `joinRoom(code)` 之前，请等待 `authReady`。两者都会调用受信任的服务端函数；当服务端将 `roomMembers/{roomId}/{uid}` 持久化之后，该 hook 才可以读取并订阅对应的房间。

成员可以更新共享的 `state`、自己的 `name`、`connected` 和 `lastSeenAt`，以及 `meta/updatedAt`。只有房主才能更改房间状态。ID、角色、加入时间戳、成员身份、容量、配对代码以及 `joinState` 始终以服务端为准。

`state` 被有意设计得足够通用，不会校验特定产品的数据结构，也不保证负载大小和写入频率的限制。每个产品在正式部署前，都必须根据自身的数据和流量特点，添加相应的状态校验、负载限制以及客户端/服务端的节流控制。

### 数据结构

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

## Firebase 设置：三种方式

请根据你是否需要一个可分享的 URL，以及是否能够绑定信用卡来做出选择。

### 1. 模拟器 —— 免费、无需信用卡、仅限本地（最适合学习）

Firebase Emulator Suite 可以在你的机器上完整运行 Auth、Realtime Database 和 Cloud Functions。无需开通结算账户，也无需信用卡。

```bash
npm install
npm --prefix functions install
npm --prefix functions run build
npx firebase-tools emulators:start --only auth,database,functions
```

一切都在本地运行。你无法通过模拟器把公开链接分享给其他人——它仅用于开发和学习。

### 2. Spark（免费）方案 —— 能做什么、不能做什么

Spark 方案**无需信用卡**，可以通过 Firebase Hosting 提供一个公开站点，并支持 Realtime Database，但有**最多 100 个并发连接**的硬性上限。**然而，Spark 无法部署 Cloud Functions**——而 snap-pair 依赖 Cloud Functions 来实现安全的房间创建与加入。因此，仅靠 Spark 不足以在公开环境中运行完整的服务端辅助设计。

### 3. Blaze（按使用量付费）方案 —— 正式上线所必需（需要信用卡）

要将 Cloud Functions 部署到公开互联网，项目必须使用 **Blaze 方案，该方案需要绑定信用卡/结算账户。** Blaze 依然保留免费额度（**每月约 200 万次函数调用**免费；RTDB 最多支持 **20 万个并发连接**），仅在超出免费额度后才会计费，因此小型活动往往不会产生费用——但**必须先绑定信用卡才能开通该方案。**

```bash
npm --prefix functions run build
firebase use YOUR_EXISTING_PROJECT
firebase deploy --only functions
firebase deploy --only database
```

两个可调用函数都强制启用了 **Firebase App Check**。如果要针对真实项目进行本地开发，请配置调试令牌，并且切勿在已部署的可调用函数中关闭该强制校验。请务必在 Firebase 控制台 → Usage and billing（使用量与结算）中**设置预算提醒。**（预算提醒只会发出通知，并不会强制设定费用上限；如需硬性上限，需要自定义结算函数。）

---

## 验证

```bash
npm test
npm run typecheck
npm --prefix functions test
npm --prefix functions run typecheck
npm run test:rules-emulator
```

## AI 智能体技能

[`SKILL.md`](./SKILL.md) 可以让 AI 编程智能体为新产品生成正确的、服务端辅助的 snap-pair 集成方案。将其复制到你的智能体的技能目录中即可。若需了解私密输入、聚合结果统一公开、承诺阈值这类模式，请参见 [`references/one-room-one-decision.md`](./references/one-room-one-decision.md)。

## 支付

支付功能不在本基础框架的范围内。如果产品需要支付功能，请另行添加一套受信任的服务端集成，包含成员身份校验以及支付服务商的 webhook 验证。

## 许可协议

MIT —— 详见 [LICENSE](./LICENSE)。
