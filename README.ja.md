# snap-pair-core

[English](https://github.com/takaoumehara/snap-pair-core/blob/main/README.md) · **日本語** · [简体中文](https://github.com/takaoumehara/snap-pair-core/blob/main/README.zh-CN.md) · [Español](https://github.com/takaoumehara/snap-pair-core/blob/main/README.es.md) · [한국어](https://github.com/takaoumehara/snap-pair-core/blob/main/README.ko.md)

QRコードまたは6桁のコードを使って、スマートフォンとブラウザをペアリングし、その場にいる全デバイス間でライブの状態を共有します。アプリのインストールは不要です。クライアント側はReactフック、サーバー側はFirebase Auth + Cloud Functions + Realtime Databaseで構成されています。

このリポジトリは**オープンなエンジン**（MIT）です。意図的に汎用的な設計になっており、プロダクト（ゲーム、投票、チェックリスト、ライトショーなど）はご自身で用意し、その上に構築していただく形になります。

---

## すべての人へ（非エンジニア向け）

**これは何ですか？**
多くの人のスマートフォンを、一つの共有画面に瞬時に参加させる仕組みです。全員がいつも使っているブラウザでQRコードをスキャンする（または短いコードを入力する）だけで — アプリのダウンロードは不要 — 各自のスマートフォンが一つのライブで同期された体験の一部になります。

**どんな人向けですか？**
- **イベント、会場、授業、配信、ショールーム、展示会**を運営していて、来場者に自分のスマートフォンで参加してもらいたい人。
- そうした体験を作る**エンジニアやAIビルダー**。

**何を作れますか？**
- 大画面でのライブ投票、アンケート、クイズ
- グループのチェックリストや「全員準備完了」の確認
- 観客のリアクション、予想ゲーム、共同お絵描き
- 会場全体でのスマートフォン同期ライトショー
- 「一つの共有画面＋多数のスマートフォン＋即座の結果」というあらゆる瞬間

**どうやって使いますか（AIコーディングツールを使う場合）？**
自分でコードを書く必要は**ありません**。Claude Code、Cursor、Codexなどの**AIコーディングアシスタント**を使えば：

1. このリポジトリと[`SKILL.md`](./SKILL.md)ファイルをAIに渡します。
2. 例えば、こう指示します。「snap-pair-coreとSKILL.mdを読んで、ゲストがQRコードで参加しスマートフォンで回答するライブクイズゲームを作って」
3. AIがSKILL.mdの安全でサーバー支援型の設計に従って、アプリを生成してくれます。

**一つ重要なステップ：Firebaseのセットアップ。**
どこかの時点で、AIから**Firebase**プロジェクト（リアルタイムのバックエンドを動かすGoogleのサービス）への接続を求められます。方法は3つあり、どれが適切かは、**個人的に学習・構築したいだけ**なのか、**他の人に実際に使ってもらいたい**のかによって変わります。

| 目的 | 使うもの | クレジットカード | URLで他の人が参加できるか |
|---|---|---|---|
| 学習・実験、子どもに構築・テストさせる | **Firebaseエミュレーター**（自分のPC上で動作） | **カード不要** | いいえ — ローカルのみ |
| 実際の人が自分のスマートフォンから参加する | **Firebase Blazeプラン** | **必要、クレジットカードが必須** | はい |

- **学習・個人的な構築 → エミュレーター。** 自分のPC上だけで完結し、無料で、**クレジットカードは不要**です。試作やAIを使った学習を行う子どもにも最適です。唯一の制約は、ローカル環境なので他の人にリンクを送れないことです。
- **実際のゲストと本番運用 → Blazeプラン。** バックエンド（Cloud Functions）をインターネットに公開するには、Firebaseは**Blaze（従量課金）プランを要求し、クレジットカードの登録が必要です。** 無料枠は大きく（月あたり約200万回の関数呼び出しが無料）、小規模なイベントであれば通常は無料で収まりますが、**それを有効にするにはカードが必要です。** Firebaseコンソールで必ず予算アラートを設定してください。
- **そもそもなぜカードが必要なのですか？** 安全性のため、snap-pairはルームの作成や参加をブラウザ側ではなくサーバー側（Cloud Functions）でチェックします。Firebaseは無料の（Spark）プランではCloud Functionsの公開を許可しておらず、Blazeプランでのみ可能です。これはFirebase側のルールであり、snap-pair固有の制約ではありません。カードを追加したくない場合でも、公開リンクの共有以外はエミュレーターを使ってすべて行うことができます。

---

## エンジニア向け

`snap-pair-core`は、QRコードまたは6桁のコードを使ってブラウザを一時的にペアリングするための、React／Firebase Realtime Database基盤です。最大300人までの参加者を持つルームに対して、プレゼンス（在室状態）と軽量な共有状態を提供します。

本番環境はサーバー支援型（server-assisted）です。Firebase Authが各ブラウザを識別し、Cloud Functionsがルームの作成と参加者の受け入れを行い、RTDBのセキュリティルールにより、受け入れ済みのルームメンバーのみが限定された範囲のフィールドを購読・更新できます。短いペアリングコードはルームの所在を示すものであり、**認可のための資格情報ではありません**。

### アーキテクチャ

- **React 18フック**（`src/hooks/useSnapPair.ts`）：認証準備完了状態、ルームの購読、自分自身のプレゼンス、範囲限定の状態更新、退出処理を扱います。
- **型定義**（`src/types/index.ts`）：`SnapPlayer`、`SnapRoom`、ペアリング関連の型。
- **呼び出し可能なCloud Functions**（`functions/src/`）：`createSnapRoom`、`joinSnapRoom`、およびスケジュール実行される`cleanupExpiredData`。
- **セキュリティルール**（`database.rules.json`）：メンバーシップに基づく読み取り制限と、範囲を限定したクライアント書き込み。ルーム全体への広範な書き込みは許可されません。

ルームの作成と参加は、`functions/`内のAdmin SDK経由の処理を通ります。ブラウザは、ペアリングコードのレコードを読み取ったり、ルームを直接作成したり、メンバーシップ／定員のレコードを書き込んだりすることはできません。

### Reactでの使い方

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

`createRoom(initialState)`または`joinRoom(code)`を呼び出す前に、`authReady`を待ってください。どちらも信頼されたサーバー関数を呼び出します。サーバーが`roomMembers/{roomId}/{uid}`を永続化した後、フックはそのルームを読み取り・購読できるようになります。

メンバーは、共有される`state`、自分自身の`name`、`connected`、`lastSeenAt`、および`meta/updatedAt`を更新できます。ルームのステータスを変更できるのはホストのみです。ID、ロール、参加タイムスタンプ、メンバーシップ、定員、ペアリングコード、`joinState`は常にサーバー側が権威を持ちます。

`state`は意図的に汎用的な設計になっており、プロダクト固有のスキーマの検証や、ペイロードサイズ・書き込み頻度の制限は保証しません。各プロダクトは、本番デプロイの前に、自身のデータとトラフィックに適した状態検証、ペイロード制限、クライアント／サーバーのスロットリングを追加する必要があります。

### データレイアウト

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

## Firebaseセットアップ：3つの方法

共有可能なURLが必要かどうか、そしてカードを登録できるかどうかに応じて選んでください。

### 1. エミュレーター — 無料、クレジットカード不要、ローカルのみ（学習に最適）

Firebase Emulator Suiteは、Auth、Realtime Database、Cloud Functionsのすべてを、あなたのマシン上で完全に動作させます。課金アカウントもカードも不要です。

```bash
npm install
npm --prefix functions install
npm --prefix functions run build
npx firebase-tools emulators:start --only auth,database,functions
```

すべてローカルで動作します。エミュレーターから他の人に公開リンクを渡すことはできません — これは開発と学習のためのものです。

### 2. Spark（無料）プラン — できること・できないこと

Sparkプランは**クレジットカード不要**で、Firebase Hostingを通じて公開サイトを提供でき、Realtime Databaseも**最大100同時接続**という上限つきで利用できます。**ただし、SparkはCloud Functionsをデプロイできません** — そしてsnap-pairは、安全なルーム作成・参加のためにCloud Functionsに依存しています。そのため、Spark単体では、サーバー支援型の設計を公開環境で完全に運用するには不十分です。

### 3. Blaze（従量課金）プラン — 本番公開に必須（クレジットカードが必要）

Cloud Functionsをインターネット上に公開デプロイするには、プロジェクトが**Blazeプランである必要があり、これにはクレジットカード／課金アカウントの登録が必要です。** Blazeでも無料枠は維持されており（**月あたり約200万回の関数呼び出し**が無料、RTDBは最大**20万同時接続**まで）、それを超えた分のみ課金されるため、小規模なイベントであれば無料で済むことが多いです — ただし、**それを有効にするにはカードの登録が必須です。**

```bash
npm --prefix functions run build
firebase use YOUR_EXISTING_PROJECT
firebase deploy --only functions
firebase deploy --only database
```

どちらの呼び出し可能関数も**Firebase App Check**を強制します。実際のプロジェクトに対してローカル開発を行う場合はデバッグトークンを設定し、デプロイ済みの呼び出し可能関数では強制を無効化しないでください。Firebaseコンソール → Usage and billing（使用量と請求）で**必ず予算アラートを設定してください。**（予算アラートは通知するだけで、課金の上限を強制するものではありません。ハードな上限が必要な場合は、カスタムの課金制御用関数が必要です。）

---

## 検証

```bash
npm test
npm run typecheck
npm --prefix functions test
npm --prefix functions run typecheck
npm run test:rules-emulator
```

## AIエージェントスキル

[`SKILL.md`](./SKILL.md)を使うと、AIコーディングエージェントが新しいプロダクト向けに、正しくサーバー支援型のsnap-pair連携を生成できるようになります。エージェントのスキルディレクトリにコピーしてください。非公開入力・集計結果の一括公開・コミットメント閾値パターンについては、[`references/one-room-one-decision.md`](./references/one-room-one-decision.md)を参照してください。

## 決済

決済はこの基盤の対象外です。プロダクトで決済が必要な場合は、メンバーシップチェックとプロバイダーのWebhook検証を備えた、別の信頼されたサーバー連携を追加してください。

## ライセンス

MIT — 詳細は[LICENSE](./LICENSE)を参照してください。
