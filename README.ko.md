<p align="center">
  <a href="https://takaoumehara.github.io/snap-pair-skill/"><strong>📖 문서 사이트 →  takaoumehara.github.io/snap-pair-skill</strong></a>
  &nbsp;·&nbsp;
  <a href="https://takaoumehara.github.io/snap-pair-skill/demo.html">▶ 두 탭 라이브 데모</a>
</p>

<p align="center">
  <a href="https://takaoumehara.github.io/snap-pair-skill/"><img src="./docs/assets/hero.svg" alt="snap-pair: 휴대폰은 컨트롤러, 대형 화면은 호스트. QR, 6자리 PIN 또는 브로드캐스트로 페어링하고 Firebase, PartyKit, WebRTC 또는 BroadcastChannel로 실시간 전송합니다." width="100%"></a>
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
  <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.md">English</a> · <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.ja.md">日本語</a> · <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.zh-CN.md">简体中文</a> · <a href="https://github.com/takaoumehara/snap-pair-skill/blob/main/README.es.md">Español</a> · <b>한국어</b>
</p>

# snap-pair

**snap-pair는 멀티스크린 인터랙티브 웹 경험을 만들기 위한 DevTool입니다.**
휴대폰은 컨트롤러가 되고 대형 화면은 호스트가 됩니다. 사람들은 평소 쓰는 브라우저에서 QR 코드를 스캔하거나 6자리 PIN을 입력하는 것만으로 페어링되며, 아무것도 설치할 필요가 없습니다. 같은 공간의 모든 기기가 실시간 입력과 상태를 공유합니다.

퀴즈, 드로잉 월, 게임, 라이트쇼, 쇼룸 같은 제품은 여러분이 준비해서 그 위에 구축하면 됩니다. snap-pair는 페어링, 실시간 전송, 그리고 놓치기 쉬운 휴대폰 쪽 세부 사항을 처리합니다.

- **페어링:** QR 코드, 6자리 PIN, 또는 탭 간 로컬 브로드캐스트.
- **전송(Transport):** Firebase Realtime Database, PartyKit, WebRTC DataChannel, BroadcastChannel을 모두 하나의 `Transport` API로 다룹니다.
- **클라이언트 유틸리티:** 화면 꺼짐 방지(wake lock), 기기 방향 및 모션(iOS 권한 요청 포함), 화면 방향 잠금.
- **7가지 UX 프리셋**과 동작하는 앱을 바로 생성해 주는 CLI(`npx snap-pair init`).

npm 패키지 이름은 **`snap-pair-core`**(MIT)입니다.

> 전체 API 레퍼런스, FAQ, 로드맵은 [영어 README](https://github.com/takaoumehara/snap-pair-skill/blob/main/README.md#api-overview)와 [문서 사이트](https://takaoumehara.github.io/snap-pair-skill/)에서 확인하세요.

---

## 빠른 시작

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

peer 의존성: `react`(18.2+). 선택 사항: `qrcode`(`HostHUD`에서 QR 렌더링), `partysocket`(더 견고한 PartyKit 소켓), `react-dom`(생성된 템플릿에서만 사용).

가장 작은 멀티스크린 앱은 서버가 전혀 필요 없습니다. 같은 브라우저의 두 탭을 PIN으로 페어링하는 예시입니다.

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

`BroadcastChannelTransport`를 `PartyKitTransport`(또는 `WebRTCTransport`)로 바꾸면 같은 코드가 인터넷 너머에서도 동작합니다. `FirebaseTransport`는 방 상태를 공유하지만 일회성 메시징(ephemeral messaging)이 없으므로 `broadcast`를 쓸 수 없습니다([전송 방식](#전송-방식과-선택-기준) 참고).
[두 탭에서 라이브로 체험하기 →](https://takaoumehara.github.io/snap-pair-skill/demo.html)

---

## 기기 연결 방식

<p align="center">
  <img src="./docs/assets/pairing-flow.svg" alt="페어링 흐름: 호스트가 방을 만들고 QR과 PIN을 표시하면, 컨트롤러가 스캔하거나 PIN을 입력해 참가하고, 호스트가 승인한 뒤 실시간 메시지가 양방향으로 오갑니다." width="100%">
</p>

| 방식 | 게스트가 하는 일 | 지원 전송 | 헬퍼 |
|---|---|---|---|
| **QR 코드** | 카메라로 스캔; URL에 `?room=` 또는 `?pin=`이 포함됨 | 모든 전송 | `buildPairingJoinUrl`, `parseJoinUrl`, `useQrRenderer`, `HostHUD` |
| **6자리 PIN** | `042 917` 입력(전각 숫자와 대시는 자동 정규화) | PartyKit, WebRTC, BroadcastChannel | `generatePin`, `normalizePin`, `isValidPin`, `verifyPin` |
| **방 코드** | `ABC 234` 같은 6자 코드 입력(헷갈리기 쉬운 문자 없음) | 모든 전송(Firebase 기본값) | `normalizeRoomCode`, `generateRoomCode` |
| **브로드캐스트** | 같은 기기에서 다른 탭/창을 엶 | BroadcastChannel | `BroadcastChannelTransport` |

호스트는 컴포넌트 하나로 모든 정보를 표시합니다.

```tsx
import { HostHUD, useQrRenderer } from 'snap-pair-core';

const renderQr = useQrRenderer(); // undefined if `qrcode` isn't available, so the HUD shows the code only
<HostHUD pairing={pairing} renderQr={renderQr} peerCount={peers.length} status={status} />;
```

---

## 전송 방식과 선택 기준

<p align="center">
  <img src="./docs/assets/architecture.svg" alt="아키텍처: 여러분의 앱이 프리셋, useSnapPair, HostHUD, ControllerWrapper, CLI 위에 놓이고, 그 아래는 페어링, 전송, 클라이언트 유틸리티의 세 계층으로 구성됩니다." width="100%">
</p>

<p align="center">
  <img src="./docs/assets/transport-matrix.svg" alt="동일 기기, 인터넷, 지연 시간, 서버 필요 여부, 비용, 오프라인 기준의 전송 방식 비교." width="100%">
</p>

| 이런 것이 필요하다면… | 사용 | 이유 |
|---|---|---|
| 공유 상태 앱(턴제 게임, 체크리스트, 로비), 서버에서 검증하는 참가(최대 300명), 인증, 영속성 | **Firebase**(`useSnapPair` 기본값) | Cloud Functions가 모든 게스트를 승인하고, RTDB 규칙이 멤버가 쓸 수 있는 범위를 제한. 공유 상태 전용이며 일회성 메시징 없음 |
| 인터넷을 통한 휴대폰 입력, 최대 수백 명 규모의 방, 간단한 배포 | **PartyKit** | 아주 작은 WebSocket 릴레이([`examples/partykit/`](./examples/partykit/)); 방은 호스트 브라우저가 소유 |
| 가장 낮은 지연 시간(드로잉, 게임, 모션) | **WebRTC** | P2P DataChannel; 시그널링은 PartyKit(또는 메시징을 지원하는 모든 전송)을 이용 |
| **한 대의** 기기에서 여러 창이나 디스플레이, 오프라인 | **BroadcastChannel** | 네트워크도, 서버도, 계정도 필요 없음 |

네 가지 모두 같은 `Transport` 인터페이스(`connect`, `createRoom`, `joinRoom`, `setState`, `send`, `broadcast`, `onMessage`, `onPeers`, `onState`, `onStatus`…)를 구현하므로 한 줄만 바꾸면 전환할 수 있습니다. UI가 기능에 따라 우아하게 축소되어야 할 때는 `transport.capabilities`(`messaging`, `presence`, `serverAuthoritativeJoin`)를 확인하세요.

> **Firebase에는 일회성 메시징이 없습니다.** `FirebaseTransport`는 `capabilities.messaging === false`를 보고하고 `send`/`broadcast`를 거부하며, `setState`는 상태 객체 전체를 교체하므로 여러 작성자가 동시에 쓰면 서로 덮어씁니다. 7가지 프리셋은 모두 입력을 스트리밍하므로 어느 것도 Firebase에서 동작하지 않습니다. Firebase를 고르면 `npx snap-pair init`이 두 가지 선택지를 제시합니다. 설정만 있는 Firebase 앱(`preset: null`, `useSnapPair`로 상태 공유), 또는 앱에는 Firebase를 쓰고 프리셋의 실시간 메시지에는 PartyKit을 쓰는 구성입니다.

```ts
import { PartyKitTransport, WebRTCTransport, FirebaseTransport } from 'snap-pair-core';

const party = new PartyKitTransport({ host: 'my-relay.me.partykit.dev', pairing: 'pin' });
const p2p = new WebRTCTransport({ signaling: party }); // DataChannel star, host in the middle
const fb = new FirebaseTransport({ db, auth, functions }); // server-authoritative rooms, shared state only
```

WebRTC는 스스로 재연결하며(같은 연결에서 ICE restart를 시도한 뒤 지수 백오프로 다시 offer), 16 KiB를 넘는 프레임은 청크로 나눠 보냅니다(메시지당 최대 1 MiB). 복구를 끄려면 `reconnect: false`를 전달하세요.

---

## 프리셋

바로 쓸 수 있는 7가지 UX 패턴입니다. 각 프리셋에는 `npx snap-pair init`으로 생성할 수 있는 템플릿, 권장 전송 방식, 메시지 형식, 템플릿이 지키는 전송 빈도 제한이 있습니다(`PRESETS` / `getPreset(id)`로 모두 조회 가능).

<table>
  <tr>
    <td width="33%" align="center"><img src="./site/assets/img/presets/stroke-stream.svg" alt="Stroke Stream: 휴대폰에 그리면 획이 대형 화면으로 실시간 전송됩니다. 권장: WebRTC 또는 PartyKit." width="100%"></td>
    <td width="33%" align="center"><img src="./site/assets/img/presets/particle-blast.svg" alt="Particle Blast: 탭하거나 스와이프해서 호스트 캔버스에 파티클을 터뜨립니다. 권장: PartyKit 또는 WebRTC." width="100%"></td>
    <td width="33%" align="center"><img src="./site/assets/img/presets/type-throw.svg" alt="Type Throw: 단어를 입력하고 공유 벽으로 휙 던집니다. 권장: PartyKit 또는 WebRTC." width="100%"></td>
  </tr>
  <tr>
    <td align="center"><img src="./site/assets/img/presets/room-quiz-poll.svg" alt="Room Quiz / Poll: 모두가 휴대폰으로 답하고 결과가 즉시 표시됩니다. 권장: PartyKit + PIN 페어링." width="100%"></td>
    <td align="center"><img src="./site/assets/img/presets/virtual-controller.svg" alt="Virtual Controller: 방향 패드와 버튼으로 모든 휴대폰이 게임패드가 됩니다. 권장: WebRTC 또는 PartyKit." width="100%"></td>
    <td align="center"><img src="./site/assets/img/presets/motion-sensor.svg" alt="Motion / Sensor: 기기 방향을 이용해 기울이고, 흔들고, 회전합니다. 권장: WebRTC 또는 PartyKit." width="100%"></td>
  </tr>
  <tr>
    <td align="center"><img src="./site/assets/img/presets/local-multi-display.svg" alt="Local Multi-Display: 한 대의 기기에서 창과 탭을 오프라인에서도 동기화합니다. 권장: BroadcastChannel." width="100%"></td>
    <td colspan="2" valign="middle">
      <b>프리셋 ID</b>(CLI 및 <code>snap-pair.config.json</code>용):<br><br>
      <code>stroke-stream</code> · <code>particle-blast</code> · <code>type-throw</code> · <code>room-quiz-poll</code> · <code>virtual-controller</code> · <code>motion-sensor</code> · <code>local-multi-display</code>
    </td>
  </tr>
</table>

| 프리셋 | id | 호스트 화면 | 휴대폰이 보내는 것 | 전송(**권장**이 먼저) | 페어링(기본값이 먼저) |
|---|---|---|---|---|---|
| Stroke Stream | `stroke-stream` | 공유 캔버스 | 포인터 획 | **WebRTC** · PartyKit · BroadcastChannel | QR · code · PIN |
| Particle Blast | `particle-blast` | 파티클 필드 | 탭 / 스와이프 | **PartyKit** · WebRTC · BroadcastChannel | QR · PIN · code |
| Type Throw | `type-throw` | 단어 벽 | 짧은 텍스트 | **PartyKit** · WebRTC · BroadcastChannel | QR · PIN · code |
| Room Quiz / Poll | `room-quiz-poll` | 질문 + 실시간 집계 | 투표 | **PartyKit** · BroadcastChannel · WebRTC | PIN · QR · code |
| Virtual Controller | `virtual-controller` | 게임 화면 | 방향 패드 / 버튼 상태 | **WebRTC** · PartyKit · BroadcastChannel | QR · code · PIN |
| Motion / Sensor | `motion-sensor` | 기울기로 움직이는 장면 | 방향 / 모션 | **WebRTC** · PartyKit · BroadcastChannel | QR · code · PIN |
| Local Multi-Display | `local-multi-display` | 여러 창에 걸친 하나의 장면 | 창 상태 | **BroadcastChannel** | broadcast |

어떤 프리셋도 Firebase를 지원하지 않습니다. [전송 방식](#전송-방식과-선택-기준)의 안내를 참고하세요.

---

## CLI

```bash
npx snap-pair init                                    # interactive wizard (default command)
npx snap-pair init --yes --preset room-quiz-poll --out my-quiz
npx snap-pair init --yes --architecture managed --no-scaffold   # Firebase config only
npx snap-pair presets                                 # list the 7 presets (--json for the registry)
npx snap-pair recommend "a tilt racing game for 4 friends"
```

마법사는 영어 또는 일본어로 진행되며(`LANG` / `LC_ALL`로 감지하거나 `--lang en|ja`로 지정), 네 가지 진입 경로를 제공합니다(`--path`로 메뉴를 건너뛸 수 있음).

| 경로(`--path`) | 답하는 내용 | 얻는 것 |
|---|---|---|
| **1. 경험 기준**(`ux`) | 7가지 프리셋 중 어느 것이 맞는지 | 해당 프리셋과 그 프리셋이 지원하는 전송(권장이 먼저) |
| **2. 아키텍처 기준**(`architecture`) | 같은 기기, 실시간, P2P, 매니지드 중 무엇인지 | 전송 방식과 그에 맞는 프리셋 |
| **3. 스택 기준**(`stack`) | 이미 가진 것: Firebase, Cloudflare/PartyKit, 백엔드 없음 | 여러분의 스택에 맞춘 전송 방식 |
| **4. 설명하기**(`consult`) | 영어나 일본어로 된 한 문장, 예: "관객이 무대 화면에서 투표" | 수락하거나 조정할 수 있는 규칙 기반 추천 |

Firebase를 고르면 설정만 있는 Firebase 앱, 또는 Firebase + 프리셋 실시간 메시지용 PartyKit 중에서 선택할 수 있습니다. 모든 경로는 **`snap-pair.config.json`** 파일을 작성하고 Vite + React 템플릿(호스트와 컨트롤러가 하나의 앱에 있고 URL로 구분)을 생성하며, 전송에 필요하면 PartyKit 릴레이(`party/server.ts`)도 생성합니다.

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

| 플래그 | 의미 |
|---|---|
| `--preset <id\|none>` | 7가지 프리셋 id 중 하나 또는 `none` |
| `--transport <t>` | `broadcast` \| `partykit` \| `webrtc` \| `firebase` |
| `--pairing <m>` | `qr` \| `code` \| `pin` \| `broadcast` |
| `--architecture <a>` | `same-device` \| `realtime` \| `p2p` \| `managed` |
| `--stack <s>` | `firebase` \| `cloudflare` \| `none` |
| `--describe <text>` | `consult` 경로에 쓰는 자유 설명 |
| `--out <dir>` | 대상 폴더(기본값: `./snap-pair-<preset>`) |
| `--no-scaffold`, `--force` | 설정만 작성; 기존 파일 덮어쓰기 |
| `-y, --yes` | 모든 기본값 수락(비대화형) |
| `--json` | stdout에 JSON 결과(`config`, `files`, `nextSteps`) 출력 |
| `--lang <en\|ja>` | 언어 |

선택을 바꾸고 싶으면 언제든 명령을 다시 실행하세요.

---

## 모든 사람을 위한 안내 (비개발자용)

**이것은 무엇인가요?** 많은 사람의 휴대폰을 하나의 공유 화면에 즉시 참여시키는 방법입니다. 모두가 평소 쓰는 브라우저에서 QR 코드를 스캔하거나 짧은 코드를 입력하면, 앱 다운로드 없이 휴대폰이 하나의 실시간 동기화된 경험의 일부가 됩니다. 행사, 공연장, 수업, 스트리밍, 쇼룸, 전시회에 적합합니다.

아래 세 가지는 같은 과정의 단계가 아니라 서로 별개의 경로입니다. 지금 하고 싶은 것에 맞는 하나를 고르세요.

### 경로 A: 일단 작동하는 것만 보기

- **지금 바로 브라우저에서:** [라이브 데모](https://takaoumehara.github.io/snap-pair-skill/demo.html)를 두 탭에서 엽니다. 한쪽은 호스트로 PIN을 표시하니, 다른 쪽에 그 PIN을 입력하고 그림을 그려 보세요. 준비할 것은 없습니다.
- **휴대폰 두 대로:** [`examples/snap-pair-lite.html`](./examples/snap-pair-lite.html)을 다운로드해 열고, 다른 기기로 QR 코드를 스캔합니다. 무료 Firebase Spark 요금제에서 신용카드 없이 동작하는 고정 틱택토 데모입니다([`examples/README.md`](./examples/README.md) 참고).

### 경로 B: AI에게 내 앱을 만들어 달라고 하기

이 저장소를 다운로드하거나 클론할 필요가 **없습니다.** 작은 도구 두 개(MCP 서버)를 연결하고, AI에게 이 프로젝트의 제작 지침을 웹에서 읽도록 지시하기만 하면 됩니다. 명령을 실행하고 웹페이지를 가져올 수 있는 AI 코딩 도구(Claude Code, Cursor, Codex, Gemini CLI 등)가 하나 필요합니다.

1. 아무 폴더(빈 폴더도 OK)에서 AI 도구의 채팅을 엽니다.
2. 다음 내용을 그대로 붙여넣습니다(영어 그대로 두세요).

   ```
   Fetch https://raw.githubusercontent.com/takaoumehara/snap-pair-skill/main/SKILL.md
   and use it as your build instructions.

   Connect these two MCP servers if they aren't connected yet:
   - firebase: npx -y firebase-tools@latest mcp
   - snap-pair-provisioner: npx -y snap-pair-provisioner

   Then help me build: [describe what you want, e.g. "a live quiz game where
   guests join by QR code and answer on their phones"].
   ```

3. AI의 질문에 차례로 답합니다. Firebase에 사용할 Google 계정을 묻고, 어느 시점에 일회용 로그인 링크를 보여 줍니다. 계정 보안을 위해 이 클릭만은 의도적으로 수동 단계로 남겨 두었습니다.

도구가 웹페이지를 가져올 수 없다면 [`SKILL.md`](./SKILL.md)만 다운로드해 그 내용을 채팅에 붙여넣으세요.

### 경로 C: 소스 코드를 직접 다루기

`git clone https://github.com/takaoumehara/snap-pair-skill.git` 후 `npm install`, `npm test`를 실행하고, 영어 README의 API overview와 [`docs/`](./docs/)의 설계 문서를 읽어 보세요.

---

## Firebase 안내

Firebase 전송을 쓸 때만 필요합니다. PartyKit, WebRTC, BroadcastChannel은 Firebase를 전혀 사용하지 않습니다.

- **Firebase 에뮬레이터:** 내 컴퓨터에서 실행되며 **신용카드 불필요**, 로컬 전용입니다. 학습과 실험에 적합합니다.
- **Spark 요금제(무료):** **신용카드 불필요**, 공개 사이트를 운영할 수 있지만 Realtime Database는 **동시 접속 100개**로 제한되고 **Cloud Functions를 배포할 수 없습니다.** Lite 모드나 다른 전송 방식에 사용하세요.
- **Blaze 요금제(종량제):** 보안 모드(서버에서 검증하는 방)에 필요하며 **신용카드 등록이 필요합니다.** 무료 할당량은 그대로 유지되므로 소규모 행사는 대개 비용이 들지 않습니다. Firebase 콘솔에서 반드시 **예산 알림을 설정**하세요(알림은 통지만 할 뿐 요금을 강제로 막지는 않습니다).

## 보안 안내

- **페어링 코드는 방을 찾기 위한 것이지 비밀번호가 아닙니다.** QR 코드, 방 코드, PIN은 만남의 표식으로만 취급하세요.
- **Firebase(보안 모드)** 는 서버가 권한을 가집니다. Cloud Functions가 방을 만들고 참가자를 승인하며, RTDB 규칙은 승인된 멤버만 제한된 필드를 읽거나 갱신하도록 허용합니다.
- **PartyKit, WebRTC, BroadcastChannel** 은 호스트가 권한을 가지는 릴레이 전송입니다. 서버가 참가자를 승인하지 않으므로(`capabilities.serverAuthoritativeJoin === false`) `admit(peer)`와 `maxPlayers`로 입장을 통제하세요.
- 6자리 PIN의 경우의 수는 10⁶개뿐입니다. 공개 릴레이에서는 속도 제한을 추가하고([`examples/partykit/`](./examples/partykit/) 참고), 민감한 용도에는 PIN만으로 보호하지 마세요.

---

## 추가 문서

전체 **API 레퍼런스**, **FAQ**, **로드맵**은 [영어 README](https://github.com/takaoumehara/snap-pair-skill/blob/main/README.md#api-overview)와 [문서 사이트](https://takaoumehara.github.io/snap-pair-skill/)에서 확인할 수 있습니다.

## 라이선스

MIT. 자세한 내용은 [LICENSE](./LICENSE)를 참고하세요.

> v2.1.0+ adds experimental ultrasonic (Proximity) sound pairing alongside QR and PIN. See the English README for API details and limitations.
