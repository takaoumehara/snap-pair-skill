<p align="center">
  <a href="https://takaoumehara.github.io/snap-pair-skill/"><strong>📖 ドキュメントサイト →  takaoumehara.github.io/snap-pair-skill</strong></a>
  &nbsp;·&nbsp;
  <a href="https://takaoumehara.github.io/snap-pair-skill/demo.html">▶ 2タブで試せるライブデモ</a>
</p>

<p align="center">
  <a href="https://takaoumehara.github.io/snap-pair-skill/"><img src="./docs/assets/hero.svg" alt="snap-pair：スマートフォンがコントローラー、大画面がホストに。QRコード・6桁PIN・ブロードキャストでペアリングし、Firebase・PartyKit・WebRTC・BroadcastChannelでリアルタイムに通信します。" width="100%"></a>
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/snap-pair-core"><img src="https://img.shields.io/badge/npm-snap--pair--core-cb3837?logo=npm" alt="npm: snap-pair-core"></a>
  <img src="https://img.shields.io/badge/license-MIT-blue" alt="ライセンス: MIT">
  <img src="https://img.shields.io/badge/React-18%2B-61dafb?logo=react&logoColor=white" alt="React 18以上">
  <img src="https://img.shields.io/badge/TypeScript-ready-3178c6?logo=typescript&logoColor=white" alt="TypeScript対応">
  <img src="https://img.shields.io/badge/transports-4-4f46e5" alt="4種類のTransport">
  <img src="https://img.shields.io/badge/UX%20presets-7-0d9488" alt="7種類のUXプリセット">
</p>

<p align="center">
  <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.md">English</a> · <b>日本語</b> · <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.zh-CN.md">简体中文</a> · <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.es.md">Español</a> · <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.ko.md">한국어</a>
</p>

# snap-pair

**snap-pairは、マルチスクリーンのインタラクティブなWeb体験をつくるためのDevToolです。**
スマートフォンがコントローラーに、大画面がホストになります。参加者はいつも使っているブラウザでQRコードをスキャンするか、6桁のPINを入力するだけでペアリングでき、インストールは一切不要です。その場にいるすべてのデバイスが、入力と状態をリアルタイムに共有します。

プロダクト（クイズ、お絵描きウォール、ゲーム、ライトショー、ショールームなど）はご自身で用意し、その上に構築していただく形です。snap-pairは、ペアリング、リアルタイム通信（Transport）、そしてつまずきやすいスマートフォン側の細かな処理を引き受けます。

- **ペアリング：** QRコード、6桁のPIN、またはタブ間のローカルブロードキャスト。
- **Transport：** Firebase Realtime Database、PartyKit、WebRTC DataChannel、BroadcastChannelを、すべて1つの`Transport` APIで扱えます。
- **クライアントユーティリティ：** 画面のスリープ防止（Wake Lock）、デバイスの向き・モーション（iOSの許可ダイアログを含む）、画面の向きのロック。
- **7種類のUXプリセット**と、動作するアプリを生成するCLI（`npx snap-pair init`）。

npmパッケージ名は **`snap-pair-core`**（MIT）です。

## 目次

- [クイックスタート](#クイックスタート)
- [デバイスの接続方法](#デバイスの接続方法)
- [Transportの選び方](#transportの選び方)
- [プリセット](#プリセット)
- [CLI](#cli)
- [API概要](#api概要)
- [すべての人へ（非エンジニア向け）](#すべての人へ非エンジニア向け)
- [Firebaseのセットアップ](#firebaseのセットアップ)
- [セキュリティモデル](#セキュリティモデル)
- [AIエージェントスキル](#aiエージェントスキル)
- [よくある質問](#よくある質問)
- [ロードマップ](#ロードマップ)

---

## クイックスタート

```bash
# 1. 対話型ウィザードで新しいアプリを生成（英語/日本語対応）
npx snap-pair init

#    …または非対話モードで（CI、AIエージェント向け）
npx snap-pair init --yes --preset room-quiz-poll --out my-quiz

# 2. または既存のReactアプリにライブラリを追加
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

ピア依存関係は`react`（18.2以上）です。任意で`qrcode`（`HostHUD`でのQRコード描画）、`partysocket`（より堅牢なPartyKitソケット）、`react-dom`（生成されるテンプレートのみが使用）を追加できます。

最小構成のマルチスクリーンアプリなら、サーバーは一切不要です。同じブラウザの2つのタブをPINでペアリングできます。

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

`BroadcastChannelTransport`を`PartyKitTransport`（または`WebRTCTransport`）に差し替えるだけで、同じコードがインターネット越しに動作します。`FirebaseTransport`はルームのstateを共有できますが、一時的なメッセージング機能がないため`broadcast`は使えません（[Transportの選び方](#transportの選び方)を参照）。
[2つのタブでライブデモを試す →](https://takaoumehara.github.io/snap-pair-skill/demo.html)

---

## デバイスの接続方法

<p align="center">
  <img src="./docs/assets/pairing-flow.svg" alt="ペアリングの流れ：ホストがルームを作成してQRコードとPINを表示し、コントローラーがスキャンまたはPIN入力で参加、ホストが受け入れると、双方向にリアルタイムメッセージが流れます。" width="100%">
</p>

| 方式 | ゲストの操作 | 対応Transport | ヘルパー |
|---|---|---|---|
| **QRコード** | カメラでスキャン。URLに`?room=`または`?pin=`が含まれます | すべてのTransport | `buildPairingJoinUrl`, `parseJoinUrl`, `useQrRenderer`, `HostHUD` |
| **6桁のPIN** | `042 917`のように入力（全角数字やハイフンも正規化されます） | PartyKit, WebRTC, BroadcastChannel | `generatePin`, `normalizePin`, `isValidPin`, `verifyPin` |
| **ルームコード** | `ABC 234`のような6文字のコードを入力（見間違えやすい文字は使いません） | すべてのTransport（Firebaseのデフォルト） | `normalizeRoomCode`, `generateRoomCode` |
| **ブロードキャスト** | 同じマシンで別のタブ／ウィンドウを開く | BroadcastChannel | `BroadcastChannelTransport` |

ホスト側の表示は、1つのコンポーネントですべてまかなえます。

```tsx
import { HostHUD, useQrRenderer } from 'snap-pair-core';

const renderQr = useQrRenderer(); // undefined if `qrcode` isn't available, so the HUD shows the code only
<HostHUD pairing={pairing} renderQr={renderQr} peerCount={peers.length} status={status} />;
```

---

## Transportの選び方

<p align="center">
  <img src="./docs/assets/architecture.svg" alt="アーキテクチャ：あなたのアプリの下に、プリセット・useSnapPair・HostHUD・ControllerWrapper・CLIがあり、それらがペアリング・Transport・クライアントユーティリティの3層の上に構築されています。" width="100%">
</p>

<p align="center">
  <img src="./docs/assets/transport-matrix.svg" alt="Transportの比較：同一デバイス、インターネット越し、レイテンシ、サーバーの要否、コスト、オフライン対応。" width="100%">
</p>

| 必要なもの | 使うもの | 理由 |
|---|---|---|
| 共有stateのアプリ（ターン制ゲーム、チェックリスト、ロビー）で、サーバー側での参加チェック（最大300人）、認証、永続化が必要 | **Firebase**（`useSnapPair`のデフォルト） | Cloud Functionsがすべてのゲストの参加を受け入れ、RTDBルールでメンバーが書き込める範囲を制限します。共有stateのみで、一時的なメッセージングはありません |
| インターネット越しのスマートフォンからの入力、数百人規模のルーム、シンプルなデプロイ | **PartyKit** | 小さなWebSocketリレー（[`examples/partykit/`](./examples/partykit/)）で、ルームはホストのブラウザが管理します |
| 最小のレイテンシ（お絵描き、ゲーム、モーション） | **WebRTC** | ピアツーピアのDataChannel。シグナリングはPartyKit（またはメッセージング対応の任意のTransport）上で行います |
| **1台**のマシン上の複数ウィンドウ／ディスプレイ、オフライン | **BroadcastChannel** | ネットワークもサーバーもアカウントも不要です |

4つすべてが同じ`Transport`インターフェース（`connect`、`createRoom`、`joinRoom`、`setState`、`send`、`broadcast`、`onMessage`、`onPeers`、`onState`、`onStatus`など）を実装しているため、切り替えは1行の変更で済みます。UIを状況に応じて縮退させたい場合は、`transport.capabilities`（`messaging`、`presence`、`serverAuthoritativeJoin`）を確認してください。

> **Firebaseには一時的なメッセージング機能がありません。** `FirebaseTransport`は`capabilities.messaging === false`を返し、`send`/`broadcast`を拒否します。また`setState`はstateオブジェクト全体を置き換えるため、複数人が同時に書き込むと互いに上書きしてしまいます。7つのプリセットはすべて入力をストリーミングするため、どれもFirebase上では動きません。Firebaseを選ぶと、`npx snap-pair init`は2つの選択肢を提示します。設定のみのFirebaseアプリ（`preset: null`、`useSnapPair`による共有state）か、アプリにはFirebaseを使いつつ、プリセットのリアルタイムメッセージにはPartyKitを使う構成です。

```ts
import { PartyKitTransport, WebRTCTransport, FirebaseTransport } from 'snap-pair-core';

const party = new PartyKitTransport({ host: 'my-relay.me.partykit.dev', pairing: 'pin' });
const p2p = new WebRTCTransport({ signaling: party }); // DataChannel star, host in the middle
const fb = new FirebaseTransport({ db, auth, functions }); // server-authoritative rooms, shared state only
```

WebRTCは自動で再接続し（同じ接続でのICEリスタート、続いて指数バックオフ付きの再オファー）、16 KiBを超えるフレームを分割して送ります（1メッセージ最大1 MiB）。復旧処理を無効にするには`reconnect: false`を渡してください。

---

## プリセット

すぐに使える7種類のUXパターンです。それぞれに`npx snap-pair init`で生成できるテンプレート、推奨Transport、メッセージの形、テンプレートが守る送信レート上限が用意されています（すべて`PRESETS` / `getPreset(id)`で取得できます）。

<table>
  <tr>
    <td width="33%" align="center"><img src="./site/assets/img/presets/stroke-stream.svg" alt="Stroke Stream：スマートフォンで描いた線が、大画面にリアルタイムで流れます。推奨：WebRTCまたはPartyKit。" width="100%"></td>
    <td width="33%" align="center"><img src="./site/assets/img/presets/particle-blast.svg" alt="Particle Blast：タップやスワイプで、ホストのキャンバスにパーティクルを放ちます。推奨：PartyKitまたはWebRTC。" width="100%"></td>
    <td width="33%" align="center"><img src="./site/assets/img/presets/type-throw.svg" alt="Type Throw：言葉を入力し、フリックで共有ウォールに投げ込みます。推奨：PartyKitまたはWebRTC。" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><img src="./site/assets/img/presets/room-quiz-poll.svg" alt="Room Quiz / Poll：全員がスマートフォンで回答し、結果が即座に表示されます。推奨：PartyKit（PINでペアリング）。" width="100%"></td>
    <td align="center"><img src="./site/assets/img/presets/virtual-controller.svg" alt="Virtual Controller：十字キーとボタンで、すべてのスマートフォンがゲームパッドになります。推奨：WebRTCまたはPartyKit。" width="100%"></td>
    <td align="center"><img src="./site/assets/img/presets/motion-sensor.svg" alt="Motion / Sensor：デバイスの向きを使って、傾け・振り・回転で操作します。推奨：WebRTCまたはPartyKit。" width="100%"></td>
  </tr>
  <tr>
    <td align="center"><img src="./site/assets/img/presets/local-multi-display.svg" alt="Local Multi-Display：1台のマシン上のウィンドウやタブを、オフラインでも同期します。推奨：BroadcastChannel。" width="100%"></td>
    <td colspan="2" valign="middle">
      <b>プリセットID</b>（CLIおよび<code>snap-pair.config.json</code>で使用）：<br><br>
      <code>stroke-stream</code> · <code>particle-blast</code> · <code>type-throw</code> · <code>room-quiz-poll</code> · <code>virtual-controller</code> · <code>motion-sensor</code> · <code>local-multi-display</code>
    </td>
  </tr>
</table>

| プリセット | id | ホストに表示されるもの | スマートフォンが送るもの（レート上限） | Transport（**推奨**が先頭） | ペアリング（先頭がデフォルト） |
|---|---|---|---|---|---|
| Stroke Stream | `stroke-stream` | 共有キャンバス | `stroke`のバッチ（毎秒30回以下） | **WebRTC** · PartyKit · BroadcastChannel | QR · コード · PIN |
| Particle Blast | `particle-blast` | パーティクルフィールド | `blast`タップ／スワイプ（毎秒10回以下） | **PartyKit** · WebRTC · BroadcastChannel | QR · PIN · コード |
| Type Throw | `type-throw` | ワードウォール | `throw`短いテキスト（毎秒2回以下） | **PartyKit** · WebRTC · BroadcastChannel | QR · PIN · コード |
| Room Quiz / Poll | `room-quiz-poll` | 問題とリアルタイムの集計 | `vote`（1問につき1回） | **PartyKit** · BroadcastChannel · WebRTC | PIN · QR · コード |
| Virtual Controller | `virtual-controller` | ゲーム画面 | `input`十字キー／ボタン（変化時、毎秒60回以下） | **WebRTC** · PartyKit · BroadcastChannel | QR · コード · PIN |
| Motion / Sensor | `motion-sensor` | 傾きで動くシーン | `motion`向き（毎秒30回以下） | **WebRTC** · PartyKit · BroadcastChannel | QR · コード · PIN |
| Local Multi-Display | `local-multi-display` | ウィンドウをまたぐ1つのシーン | `tick`、`hello`（毎秒60回以下） | **BroadcastChannel** | broadcast |

どのプリセットにもFirebaseは含まれていません（[Transportの選び方](#transportの選び方)の注記を参照）。テンプレートは、コントローラーの入力をホストにだけ送り（`send({ to: hostId })`）、stateを書き込めるのはホストのみ（`allowGuestState: false`）とし、すべてのペイロードをホスト側で範囲チェックします。

---

## CLI

```bash
npx snap-pair init                                    # 対話型ウィザード（デフォルトのコマンド）
npx snap-pair init --yes --preset room-quiz-poll --out my-quiz
npx snap-pair init --yes --preset virtual-controller --transport webrtc --json
npx snap-pair init --yes --architecture managed --no-scaffold   # Firebaseの設定のみ
npx snap-pair presets                                 # 7つのプリセットを一覧表示（--jsonでレジストリ全体）
npx snap-pair recommend "スマホを傾けて遊ぶレースゲーム"
```

ウィザードは英語と日本語に対応しており（`LANG` / `LC_ALL`から判定、または`--lang en|ja`）、4通りの入り口を用意しています（`--path`で最初のメニューを飛ばせます）。

| 入り口（`--path`） | 答えること | 得られるもの |
|---|---|---|
| **1. 体験から選ぶ**（`ux`） | 7つのプリセットのうち、どれがしっくりくるか | そのプリセットと、対応するTransport（推奨が先頭） |
| **2. アーキテクチャから選ぶ**（`architecture`） | 同一デバイス、リアルタイム、P2P、マネージドのどれか | Transportと、それに合うプリセット |
| **3. 技術スタックから選ぶ**（`stack`） | すでにあるもの：Firebase、Cloudflare/PartyKit、バックエンドなし | お使いのスタックに合わせたTransport |
| **4. 言葉で説明する**（`consult`） | 「ステージの画面で観客が投票する」のような、英語か日本語での一文 | 受け入れることも調整することもできる、ルールベースの推奨構成 |

Transportの各選択肢には、概要、長所、短所、無料枠の注記付きのコストが表示されます。Firebaseを選ぶと、設定のみのFirebaseアプリか、Firebase＋プリセットのリアルタイムメッセージ用のPartyKitかを選べます。非対話モードでは、`--yes --architecture managed --no-scaffold`でFirebaseのみの設定を書き出し、`--yes --stack firebase --preset <id>`でFirebaseアプリはそのままにプリセットをPartyKit上で動かします（`--transport firebase --preset <id>`はエラーになります）。

どの入り口も **`snap-pair.config.json`** を書き出し、Vite + Reactのテンプレート（ホストとコントローラーを1つのアプリにまとめ、URLで切り替え）を生成します。リレーが必要なTransportでは、PartyKitリレー（`party/server.ts`）も含まれます。

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

| フラグ | 意味 |
|---|---|
| `--preset <id\|none>` | 7つのプリセットIDのいずれか、または`none` |
| `--transport <t>` | `broadcast` \| `partykit` \| `webrtc` \| `firebase` |
| `--pairing <m>` | `qr` \| `code` \| `pin` \| `broadcast` |
| `--architecture <a>` | `same-device` \| `realtime` \| `p2p` \| `managed` |
| `--stack <s>` | `firebase` \| `cloudflare` \| `none` |
| `--describe <text>` | `consult`の入り口に渡すアイデアの文章 |
| `--out <dir>` | 出力先フォルダー（デフォルト：`./snap-pair-<preset>`） |
| `--partykit-host <h>`, `--max-players <n>` | 設定ファイルに書き込む値（`maxPlayers`は2〜300） |
| `--no-scaffold`, `--force` | 設定ファイルのみ書き出す／既存ファイルを上書きする |
| `-y, --yes` | すべてデフォルトで進める（非対話） |
| `--json` | 結果をJSONでstdoutに出力（`config`、`files`、`nextSteps`）。メッセージはstderrへ |
| `--lang <en\|ja>` | 表示言語 |

選択を変えたいときは、いつでもコマンドを再実行してください。

---

## API概要

すべて`snap-pair-core`からエクスポートされています（ESMとCJS、型定義付き）。サブパスのエントリーはルートと同じクラスを共有します。

| インポートパス | 内容 |
|---|---|
| `snap-pair-core` | 以下のすべて＋プリセット、i18n、ルームサーバー |
| `snap-pair-core/hooks/useSnapPair` | `useSnapPair`のみ（旧パス`snap-pair-core/src/hooks/useSnapPair`も引き続き使えます） |
| `snap-pair-core/transports/{base,firebase,partykit,webrtc,broadcast}` | Transportを個別に |
| `snap-pair-core/config.schema.json` | `snap-pair.config.json`のJSON Schema |
| `snap-pair`（bin） | CLI：`npx snap-pair` |

### React: `useSnapPair`

```tsx
import { useState } from 'react';
import { PartyKitTransport, useSnapPair } from 'snap-pair-core';

// Firebase (default): server-assisted rooms
const sp = useSnapPair({ db, auth, functions, guest: { id: '', name: 'Ada' }, maxPlayers: 8 });

// Any other transport: pass an instance (you own it) or a factory (the hook owns it)
const [party] = useState(() => new PartyKitTransport({ host: 'my-relay.me.partykit.dev', pairing: 'pin' }));
const sp = useSnapPair({ transport: party, guest: { id: '', name: 'Ada' } });

const { room, authReady, createRoom, joinRoom, updateState, updateOwnPlayer, updateRoomStatus, leaveRoom } = sp;
```

`createRoom(initialState)`や`joinRoom(code)`を呼び出す前に`authReady`を待ってください。どちらのモードでも戻り値の形は同じです。Transportを渡した場合、`authReady`は接続状態に追従し、`localGuest.id`はTransportのピアIDになります。一時的な入力にはインスタンスの`send` / `broadcast` / `onMessage`を使います。インスタンスは安定させてください（`useState(() => new X())`）。ファクトリー（`transport: () => new X()`）は一度だけ生成され、アンマウント時に切断されます。モードはコンポーネントの存続中は固定です。Firebaseでは、メンバーは共有される`state`、自分自身の`name`、`connected`、`lastSeenAt`を更新でき、ルームのステータスを変更できるのはホストのみです。

### Transport

| エクスポート | 説明 |
|---|---|
| `Transport` | 抽象基底クラス：`connect` / `disconnect`、`createRoom` / `joinRoom` / `leaveRoom`、`setState`、`send` / `broadcast`、冪等な購読解除関数を返す`on*`系の購読、そして`capabilities` |
| `FirebaseTransport`, `FirebaseRoomStore` | RTDB＋呼び出し可能なCloud Functions。`serverAuthoritativeJoin: true` |
| `PartyKitTransport` | オプション：`host`、`party`、`pairing`、`socketFactory`（バンドルしたアプリでは`partysocket`を注入）、`connectTimeoutMs`。バックオフ付きの`WebSocket`にフォールバックします |
| `WebRTCTransport` | オプション：`signaling`（メッセージング対応の任意のTransport）、`iceServers`（デフォルト：公開STUNサーバー1つ）、`connectTimeoutMs`、`reconnect`（`false`または`{ maxAttempts, baseDelayMs, maxDelayMs, iceRestartGraceMs }`）、`maxMessageBytes`（16 KiB）、`maxReassembledBytes`（1 MiB） |
| `BroadcastChannelTransport` | 同一オリジンのタブ／ウィンドウ間。`isBroadcastChannelSupported()` |
| `RelayTransport` | 上記3つの背後にある、ホスト権威型の共通エンジン。共通オプション：`pairing: 'code' \| 'pin'`、`maxPlayers`、`admit(peer)`、`namespace`、`joinBaseUrl`、`heartbeatMs`、`peerTimeoutMs`、`allowGuestState` |

### ペアリング

| エクスポート | 説明 |
|---|---|
| `generatePin()`, `normalizePin()`, `isValidPin()`, `formatPin()`, `verifyPin()` | 偏りのない6桁のPIN（`crypto.getRandomValues`）と、定数時間での照合 |
| `deriveRoomId()`, `deriveChannelName()` | コードやPINをハッシュ化し、名前空間付きのルームキーに変換。プレーンHTTPのLANオリジンでも動作します |
| `buildPairingJoinUrl()`, `parseJoinUrl()` | `?pin=` / `?room=`の参加リンク |
| `useQrRenderer()`, `createQrRenderer()`, `toQrDataUrl()`, `loadQrLib()` | 任意の`qrcode`パッケージによるQRコード描画 |
| `generateRoomCode()`, `normalizeRoomCode()`, `ROOM_CODE_ALPHABET` | 見間違えやすい文字を含まない6文字のルームコード |

### クライアントユーティリティ

| エクスポート | 説明 |
|---|---|
| `useWakeLock(enabled)`, `createWakeLock()`, `isWakeLockSupported()` | コントローラーの画面を点灯したまま保ちます。タブが再表示されると自動で再取得します |
| `needsPermission()`, `requestOrientationPermission()` | iOS 13以降の許可ダイアログ。タップのハンドラーから呼び出してください。`'granted' \| 'denied' \| 'unsupported'`を返します |
| `subscribeOrientation()`, `subscribeMotion()` | `alpha/beta/gamma`と加速度の値 |
| `lockScreenOrientation()`, `unlockScreenOrientation()`, `getScreenOrientation()` | 対応環境での画面の向きのロック |

```ts
button.onclick = async () => {
  if (needsPermission() && (await requestOrientationPermission()) !== 'granted') return;
  const stop = subscribeOrientation(({ beta, gamma }) => transport.broadcast('tilt', { beta, gamma }));
};
```

すべてのクライアントユーティリティは呼び出し時に機能検出を行い、非対応の環境では何もしない（no-op）ように縮退するため、SSR中にインポートしても安全です。

### コンポーネント

| エクスポート | 説明 |
|---|---|
| `HostHUD` | ホスト側のペアリングパネル：QRコード（`renderQr`経由）、ルームコード、PIN、コピーボタン付きの参加リンク、接続人数、ステータス。`locale="en" \| "ja" \| "auto"`に対応し、すべての文言は`labels`で上書きできます |
| `ControllerWrapper` | スマートフォン側のシェル：ステータスバー、再接続バナー、Wake Lockの切り替え、iOSのモーション許可ボタン、全画面表示＋画面の向きのロック。ブラウザが対応していない機能のボタンは自動で非表示になります |

```tsx
import { ControllerWrapper } from 'snap-pair-core';

<ControllerWrapper
  transport={party}            // or status={status}
  roomCode={room?.code}
  onReconnect={() => joinRoom(code)}
  motion                       // shows the iOS permission button until granted
  orientation="portrait"       // fullscreen button that also locks orientation
  locale="auto"                // 'en' | 'ja' | 'auto'; override strings with labels
>
  {({ status, motionPermission }) => <Pad disabled={status !== 'connected' || motionPermission !== 'granted'} />}
</ControllerWrapper>;
```

`wakeLock`のデフォルトは`true`です。ほかに`onMotionPermission`、`className`、`style`も指定できます。

### プリセットとi18n

`PRESETS`、`getPreset(id)`、`supportedTransports(preset)`、`pairingFor(preset, transport)`、`presetsForTransport(transport)`で、CLIが使っているプリセットのレジストリを参照できます。`createTranslator(locale)`、`t()`、`detectLocale()`、`SUPPORTED_LOCALES`（`en`、`ja`）は、CLI・`HostHUD`・`ControllerWrapper`が使う同梱の辞書です。

<details>
<summary><b>Firebaseのデータレイアウトとルームサーバー</b></summary>

```text
pairingCodes/{code}                 # Admin SDK only
roomMembers/{roomId}/{uid}: true    # Admin SDK only; client cannot read/write
roomCreationLimits/{uid}            # Admin SDK only; fixed-hour create quota
rooms/{roomId}/meta
rooms/{roomId}/players/{uid}
rooms/{roomId}/state
rooms/{roomId}/joinState            # Admin SDK only
```

- 呼び出し可能なCloud Functions（`functions/src/`）：`createSnapRoom`、`joinSnapRoom`、およびスケジュール実行される`cleanupExpiredData`。
- セキュリティルール（`database.rules.json`）：メンバーシップに基づく読み取り制限と、範囲を限定したクライアント書き込み。ルーム全体への広範な書き込みは許可されません。
- `state`は意図的に汎用的な設計になっており、プロダクト固有のスキーマの検証や、ペイロードサイズ・書き込み頻度の制限は行いません。各プロダクトは、本番運用の前に検証、ペイロード制限、スロットリングを必ず追加してください。

設計メモ：[docs/plan-phase1.md](./docs/plan-phase1.md)、
[docs/plan-phase2.md](./docs/plan-phase2.md)、
[docs/plan-phase3.md](./docs/plan-phase3.md)。

</details>

---

## すべての人へ（非エンジニア向け）

**これは何ですか？** 多くの人のスマートフォンを、1つの共有画面に瞬時に参加させる仕組みです。全員がいつも使っているブラウザでQRコードをスキャンする（または短いコードを入力する）だけで、アプリのダウンロードは不要です。各自のスマートフォンが、ライブで同期された1つの体験の一部になります。

**どんな人向けですか？** **イベント、会場、授業、配信、ショールーム、展示会**を運営していて、来場者に自分のスマートフォンで参加してもらいたい方、そしてそうした体験を作る**エンジニアやAIビルダー**の方です。

**何を作れますか？** 大画面でのライブ投票、アンケート、クイズ。グループのチェックリストや「全員準備完了」の確認。観客のリアクション、予想ゲーム、共同お絵描き。スマートフォンを使った同期ライトショー。「1つの共有画面＋多数のスマートフォン＋即座の結果」というあらゆる瞬間です。

### 1つ選んでください

この3つは同じ工程の順番ではなく、それぞれ別々の道です。「今まさにやりたいこと」に合う1つを選んでください。

| | **A. とにかく動くものを見る** | **B. AIに自分のアプリを作ってもらう** | **C. ソースコードを直接触る** |
|---|---|---|---|
| **こんな人向け** | 「2分で動いているところを見たい」 | 「コードを書かずに自分専用のアプリが欲しい」 | 「エンジニアで、ソースを読み書き・改造・貢献したい」 |
| **インストールするもの** | 何も無し | AIコーディングツール1つ | AIコーディングツール **＋** Git/Node.js |
| **ダウンロードするもの** | 何も無し（またはHTMLファイル1つ） | **何も無し**：AIがWeb上の指示書を直接読み込みます | リポジトリ |
| **クレジットカードは必要？** | 不要 | バックエンドによる（[Firebaseのセットアップ](#firebaseのセットアップ)を参照） | バックエンドによる |
| **他の人とリンクを共有できる？** | 同じブラウザ／同じネットワーク内 | できる（デプロイ後） | できる（デプロイ後） |
| **詳細** | [パスA](#パスaとにかく動くものを見る) | [パスB](#パスbaiに自分のアプリを作ってもらう) | [パスC](#パスcソースコードを直接触る) |

#### パスA：とにかく動くものを見る

- **今すぐブラウザで：** [ライブデモ](https://takaoumehara.github.io/snap-pair-skill/demo.html)を2つのタブで開いてください。一方がホストになってPINを表示するので、それをもう一方に入力して描いてみましょう。準備は一切不要です。
- **2台のスマートフォンで：** [`examples/snap-pair-lite.html`](./examples/snap-pair-lite.html)をダウンロードして開き、別のデバイスでQRコードをスキャンしてください。無料のFirebase Sparkプラン上で動く固定の〇×ゲームのデモで、クレジットカードは不要です（[`examples/README.md`](./examples/README.md)を参照）。

#### パスB：AIに自分のアプリを作ってもらう

このリポジトリをダウンロードしたりcloneしたりする必要は**ありません**。2つの小さな道具（MCPサーバー）に接続し、このプロジェクトの作り方の説明書をWeb上から読み込むようAIに指示するだけで十分です。

**必要なもの：** コマンドを実行したりWebページを取得したりできるAIコーディングツール1つ（Claude Code、Cursor、Codex、Gemini CLIなど）。まだ持っていない場合は、次のどれか1つを選んでください：[Cursor](https://cursor.com)（AIが内蔵されたエディター）、**Claude Code**（VS Code拡張機能、または[claude.com/code](https://claude.com/code)から入手できるCLI）、または **Codex** / **Gemini CLI**。

1. AIツールで、任意のフォルダでチャットを開きます（空のフォルダで構いません）。
2. 次の文章をそのまま貼り付けます（英語のままで問題ありません。最後の［］の中だけ、作りたいものを日本語で書き換えても大丈夫です）。

   ```
   Fetch https://raw.githubusercontent.com/takaoumehara/snap-pair-skill/main/SKILL.md
   and use it as your build instructions.

   Connect these two MCP servers if they aren't connected yet:
   - firebase: npx -y firebase-tools@latest mcp
   - snap-pair-provisioner: npx -y snap-pair-provisioner

   Then help me build: [describe what you want, e.g. "a live quiz game where
   guests join by QR code and answer on their phones"].
   ```

3. AIからの質問に順に答えていきます。Firebaseにどのgoogleアカウントを使うかを聞かれ、どこかの時点で一度きりのサインイン用リンクが表示されます。この1クリックだけが唯一の手作業で、アカウントの安全のために意図的に自動化していません。

お使いのツールがWebページを取得できない場合は、[`SKILL.md`](./SKILL.md)だけをダウンロードし、その中身をチャットに貼り付けてください。

#### パスC：ソースコードを直接触る

```bash
git clone https://github.com/takaoumehara/snap-pair-skill.git
cd snap-pair-skill
npm install
npm test
```

そのあと、[API概要](#api概要)と[`docs/`](./docs/)内の設計メモを読んでください。

---

## Firebaseのセットアップ

Firebase Transportを使う場合にのみ必要です。PartyKit、WebRTC、BroadcastChannelはFirebaseを一切使いません。

| 目的 | 使うもの | クレジットカード | URLで他の人が参加できるか |
|---|---|---|---|
| 学習・実験、子どもに構築・テストさせる | **Firebaseエミュレーター**（自分のPC上で動作） | **不要** | いいえ（ローカルのみ） |
| 無料の公開デモ、オープンなルール、少人数 | **Sparkプラン**＋Liteモード（[`examples/`](./examples/)） | **不要** | はい（最大100同時接続） |
| サーバー側でチェックされるルームに実際のゲストを招く | **Blazeプラン** | **必要** | はい |

### 1. エミュレーター：無料、カード不要、ローカルのみ

```bash
npm install
npm --prefix functions install
npm --prefix functions run build
npx firebase-tools emulators:start --only auth,database,functions
```

### 2. Spark（無料）：できること・できないこと

Sparkプランはカード不要で、Firebase Hostingで公開サイトを提供でき、Realtime Databaseも **最大100同時接続** という上限つきで利用できます。**ただし、SparkではCloud Functionsをデプロイできません。** snap-pairのセキュアモードは、ルームの作成と参加をCloud Functionsに依存しています。SparkはLiteモードで使うか、別のTransportを選んでください。

### 3. Blaze（従量課金）：セキュアモードに必須（カードが必要）

Blazeでも無料枠は維持されており（**月あたり約200万回の関数呼び出し**、RTDBは最大20万同時接続）、それを超えた分のみ課金されるため、小規模なイベントであれば無料で済むことが多いです。ただし、有効化するにはカードの登録が必須です。

```bash
npm --prefix functions run build
firebase use YOUR_EXISTING_PROJECT
firebase deploy --only functions
firebase deploy --only database
```

どちらの呼び出し可能関数もFirebase App Checkを強制します。実際のプロジェクトに対してローカル開発を行う場合はデバッグトークンを設定し、デプロイ済みの呼び出し可能関数では強制を無効化しないでください。Firebaseコンソール → Usage and billing（使用量と請求）で**必ず予算アラートを設定してください**（アラートは通知するだけで、課金の上限を強制するものではありません）。

パスBのMCPサーバーが、プロジェクトの作成、サービスの有効化、`.env`の書き込みまで代わりに行います。自動化される部分と一度きりの手作業として残る部分については、[`SKILL.md`](./SKILL.md#firebase-setup-mcp-automation-vs-manual)を参照してください。

---

## セキュリティモデル

- **ペアリングコードはルームの所在を示すものであり、パスワードではありません。** QRコード、ルームコード、PINは待ち合わせのための目印として扱ってください。
- **Firebase（セキュアモード）** はサーバー権威型です。Firebase Authが各ブラウザを識別し、Cloud Functionsがルームの作成と参加者の受け入れを行い、RTDBルールにより、受け入れ済みのメンバーだけが限定された範囲のフィールドを読み取り・更新できます。ID、ロール、メンバーシップ、定員、ペアリングコード、`joinState`はサーバー側だけで管理されます。
- **PartyKit、WebRTC、BroadcastChannel** はホスト権威型です。ルームを作成したブラウザが参加者リストと状態を管理し、サーバー側でピアを受け入れる仕組みはありません（`capabilities.serverAuthoritativeJoin === false`）。参加の制御には`admit(peer)`と`maxPlayers`を使ってください。ルームキーはハッシュ化・名前空間化されるため、生のPINがURLやリレーのログに現れることはありません。
- 6桁のPINは10⁶通りしかありません。公開リレーではレート制限を追加し（[`examples/partykit/`](./examples/partykit/)を参照）、機密性の高い用途にPINだけを使うのは避けてください。
- **決済**はこのプロジェクトの対象外です。プロダクトで決済が必要な場合は、メンバーシップチェックとプロバイダーのWebhook検証を備えた、別の信頼されたサーバー連携を追加してください。

---

## AIエージェントスキル

[`SKILL.md`](./SKILL.md)を使うと、AIコーディングエージェントが正しいsnap-pair連携を生成し、適切なTransportとプリセットを選べるようになります。エージェントには次のraw URLを指定してください。

```
https://raw.githubusercontent.com/takaoumehara/snap-pair-skill/main/SKILL.md
```

または、エージェントのスキルディレクトリにコピーしてください。非公開入力・集計結果の一括公開・コミットメント閾値パターンについては、[`references/one-room-one-decision.md`](./references/one-room-one-decision.md)を参照してください。

---

## よくある質問

<details>
<summary><b>ゲストはアプリをインストールする必要がありますか？</b></summary>

いいえ。ゲストはQRコードをスキャンするかコードを入力して、普段使っているブラウザでURLを開くだけです。
</details>

<details>
<summary><b>どのTransportから始めればよいですか？</b></summary>

1台のマシンで試作するならBroadcastChannel。インターネット越しのスマートフォンならPartyKit（少人数、およそ2〜16人で最小のレイテンシが必要ならWebRTC）。参加をサーバー側でチェックする必要がある共有stateのアプリならFirebaseです（一時的なメッセージング機能はないため、入力のストリーミングにはPartyKitを組み合わせます）。または、`npx snap-pair init`（あるいは`npx snap-pair recommend "作りたいもの"`）を実行してCLIに決めてもらうこともできます。
</details>

<details>
<summary><b>クレジットカードは必要ですか？</b></summary>

BroadcastChannel、Firebaseエミュレーター、Firebase SparkのLiteモードでは不要です。Firebaseのセキュアモードにはカード登録が必要なBlazeプランが必要ですが、小規模なイベントであれば通常は無料枠内に収まります。PartyKitには独自の無料枠があります。
</details>

<details>
<summary><b>1つのルームに何人まで参加できますか？</b></summary>

Firebaseのセキュアなルームは最大300人の参加者を想定して設計されています。リレー系のTransportでは、`maxPlayers`と、ホストのブラウザが処理できる接続数によって上限が決まります。WebRTCはホストを中心としたスター型で接続するため、少人数のグループに最も適しています。
</details>

<details>
<summary><b>iPhoneでモーションが動かないのはなぜですか？</b></summary>

iOS 13以降では、タップをきっかけにした許可ダイアログが必要です。クリックハンドラーから`requestOrientationPermission()`を呼び出してください（または、ボタンを自動で追加してくれる`ControllerWrapper`を使ってください）。ページはHTTPSで配信されている必要があります。
</details>

<details>
<summary><b>Reactなしでも使えますか？</b></summary>

はい。Transport、ペアリングのヘルパー、クライアントユーティリティは素のTypeScriptです。Reactが必要なのは`useSnapPair`、`useWakeLock`、`useQrRenderer`、`HostHUD`、`ControllerWrapper`だけです。[ライブデモ](https://takaoumehara.github.io/snap-pair-skill/demo.html)は素のJavaScriptで書かれています。
</details>

<details>
<summary><b>Next.jsやSSRでも動きますか？</b></summary>

はい。インポート時に`window`、`document`、`navigator`に触れるモジュールはありません。Transportはエフェクト内やクライアントコンポーネント内で生成してください。
</details>

---

## ロードマップ

- [x] **Phase 1：** `Transport`の抽象化、`FirebaseTransport`、`HostHUD`
- [x] **Phase 2：** PartyKit、WebRTC、BroadcastChannelの各Transport、PINとQRコードのヘルパー、Wake Lockと画面の向きのユーティリティ
- [x] **Phase 3：** `npx snap-pair init`ウィザード（4つの入り口、英語/日本語）と`presets`・`recommend`コマンド、7種類のプリセットテンプレート、`ControllerWrapper`、`useSnapPair({ transport })`、i18n、`exports`マップ付きのESM/CJSビルド、WebRTCの自動再接続とメッセージの分割送信

今後の課題：

- [ ] **WebRTC：** 再ネゴシエーション（チャネルやメディアトラックの追加）、バイナリペイロード、バックプレッシャー（`bufferedAmount`）、メッシュ構成、ホストの引き継ぎ、TURNのガイド、実ブラウザでのE2Eテスト
- [ ] **バンドルサイズ：** ルートの`useSnapPair`が`firebase/auth`を静的にインポートしているため、Firebase以外のTransportを使うアプリにも含まれてしまいます。Firebaseを含まないフックのエントリー、または遅延読み込みで解消する予定です
- [ ] **Firebase：** 数字PINと一時的なメッセージング（`rooms/$roomId/messages`）。これによりプリセットをFirebase上でも動かせるようにします
- [ ] **i18n：** 対応言語の追加。TransportのエラーメッセージとテンプレートのUI文言の日本語化

## 開発

```bash
npm test
npm run typecheck   # library + templates
npm run build       # dist/ (ESM + CJS + d.ts), dist/cli, templates/
node dist/cli/index.js --help
npm --prefix functions test
npm --prefix functions run typecheck
npm run test:rules-emulator
```

## ライセンス

MIT。詳細は[LICENSE](./LICENSE)を参照してください。
