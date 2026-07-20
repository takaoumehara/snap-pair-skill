# snap-pair-core

[English](https://github.com/takaoumehara/snap-pair-core/blob/main/README.md) · [日本語](https://github.com/takaoumehara/snap-pair-core/blob/main/README.ja.md) · [简体中文](https://github.com/takaoumehara/snap-pair-core/blob/main/README.zh-CN.md) · [Español](https://github.com/takaoumehara/snap-pair-core/blob/main/README.es.md) · **한국어**

QR 코드나 6자리 코드로 휴대폰과 브라우저를 페어링하고, 같은 공간에 있는 모든 기기 간에 실시간 상태를 공유하세요. 앱 설치가 필요 없습니다. 클라이언트에는 React 훅을, 서버에는 Firebase Auth + Cloud Functions + Realtime Database를 사용합니다.

이 저장소는 **오픈 엔진**(MIT)입니다. 의도적으로 범용적으로 설계되어 있으며, 게임, 투표, 체크리스트, 라이트쇼 같은 실제 제품은 여러분이 직접 준비해서 그 위에 구축하시면 됩니다.

---

## 모든 사람을 위한 안내 (비개발자용)

**이것은 무엇인가요?**
많은 사람의 휴대폰을 하나의 공유 화면에 즉시 참여시키는 방법입니다. 모두가 평소 사용하는 브라우저에서 QR 코드를 스캔하거나(또는 짧은 코드를 입력하거나) —별도의 앱 다운로드 없이— 휴대폰이 하나의 실시간 동기화된 경험의 일부가 됩니다.

**누구를 위한 것인가요?**
- **행사, 공연장, 수업, 스트리밍, 쇼룸, 전시회**를 운영하며 관객이 자신의 휴대폰으로 참여하기를 원하는 분들.
- 이러한 경험을 만들어주는 **엔지니어와 AI 빌더들**.

**이것으로 무엇을 만들 수 있나요?**
- 대형 화면에서 진행하는 실시간 투표, 설문, 퀴즈
- 그룹 체크리스트와 "모두 준비 완료" 확인
- 관객 반응, 예측 게임, 공동 그림 그리기
- 공간 전체 휴대폰 동기화 라이트쇼
- "하나의 공유 화면 + 다수의 휴대폰 + 즉각적인 결과"가 필요한 모든 순간

### 무엇을 하고 싶으신가요? 하나를 고르세요

이 저장소를 사용하는 방법은 크게 세 가지입니다. **지금 정말로 하고 싶은 것에 맞는 것을 하나만 고르세요** — 세 가지는 같은 과정의 단계가 아니라 서로 다른 별개의 경로입니다. 세 가지를 모두 할 필요는 없습니다.

| | **A. 일단 작동하는 것만 보고 싶다** | **B. AI에게 내 앱을 만들어 달라고 한다** | **C. 소스 코드를 직접 다룬다** |
|---|---|---|---|
| **이런 분께** | "2분 안에 작동하는 모습을 보고 싶다" | "맞춤 앱은 원하지만, 직접 코드를 작성하거나 관리하고 싶지 않다" | "엔지니어이며, 실제 소스를 읽고/수정하거나 기여하고 싶다" |
| **설치할 것** | 없음 | AI 코딩 도구 1개(대부분 이미 있음) | AI 코딩 도구 **및** Git/Node.js 지식 |
| **다운로드할 것** | HTML 파일 1개 | **없음** — AI가 바로 연결되며, 저장소 다운로드 불필요 | 저장소 전체(`git clone` 또는 ZIP) |
| **신용카드 필요?** | 아니요 | 무엇을 만드는지에 따라 다름 — 아래 Firebase 표 참고 | 무엇을 만드는지에 따라 다름 |
| **다른 사람과 링크 공유 가능?** | 예(같은 방, 같은 네트워크) | 예(배포 후) | 예(배포 후) |
| **자세히** | 아래 "경로 A" | 아래 "경로 B" | 아래 "엔지니어를 위한 안내" 섹션 |

---

### 경로 A: 일단 작동하는 것만 보기 (2분, 준비 불필요)

1. 파일 하나만 다운로드: [`examples/snap-pair-lite.html`](./examples/snap-pair-lite.html)
2. 브라우저에서 열기(더블클릭)
3. 다른 휴대폰이나 브라우저로 QR 코드 스캔

이게 전부입니다 — 설치도, 계정도, 신용카드도 필요 없습니다. 다만 이것은 고정된 데모(두 대의 휴대폰으로 즐기는 틱택토)이며 나만의 앱은 아닙니다 — 나만의 것을 원한다면 경로 B로 가세요.

---

### 경로 B: AI에게 내 앱을 만들어 달라고 하기 (다운로드 불필요)

**여기가 가장 혼동하기 쉬운 부분입니다:** 이 경로에서는 이 저장소를 다운로드하거나, 클론하거나, 압축을 풀 필요가 **전혀 없습니다.** 작은 도구 두 개(MCP 서버라고 부릅니다)에 연결하는 것만으로 충분하며, 이는 다른 MCP 서버에 연결하는 것과 완전히 동일한 방식입니다. 일반적인 MCP 연결과 다른 점은 딱 하나, AI에게 이 프로젝트의 제작 지침을 웹에서 직접 읽도록 지시하는 것뿐입니다. 이를 통해 AI가 snap-pair 앱을 올바르고 안전하게 만드는 방법을 알게 됩니다.

**먼저 필요한 것:** 명령을 실행하고 웹페이지를 가져올 수 있는 AI 코딩 도구 하나 — Claude Code, Cursor, Codex, Gemini CLI 등. 아직 없다면 아래 ["아직 AI 코딩 도구가 없다면"](#아직-ai-코딩-도구가-없다면)을 참고하세요.

**1단계 — AI 도구에서 채팅을 엽니다.** 어떤 프로젝트 폴더든 괜찮습니다(완전히 비어 있는 새 폴더도 OK — 이곳이 여러분의 앱이 될 것입니다).

**2단계 — 다음 문장을 그대로 채팅에 붙여넣습니다:**

```
https://raw.githubusercontent.com/takaoumehara/snap-pair-core/main/SKILL.md
를 가져와서 제작 지침으로 사용해 주세요.

아직 연결되어 있지 않다면 다음 두 MCP 서버에 연결해 주세요:
- firebase: npx -y firebase-tools@latest mcp
- snap-pair-provisioner: npx -y snap-pair-provisioner

그런 다음 다음을 만드는 것을 도와주세요: [만들고 싶은 것을 설명 — 예: "게스트가
QR 코드로 참여하고 휴대폰으로 답하는 실시간 퀴즈 게임"].
```

**3단계 — AI의 질문에 답해 나갑니다.** 보통 Firebase에 사용할 구글 계정을 물어보고, 이후 어느 시점에 Firebase에 로그인하기 위한 일회용 브라우저 링크를 보여줍니다(이 클릭 한 번이 전체 과정에서 유일한 수동 단계입니다 — 계정 보안을 위해 의도적으로 자동화되어 있지 않습니다).

사용 중인 AI 도구가 웹페이지를 가져올 수 없다면, 그렇다고 AI에게 확인한 뒤 이 저장소에서 `SKILL.md` 파일 하나만 다운로드하여 위의 "가져와서" 지시 대신 그 내용을 채팅에 붙여넣으세요.

#### 아직 AI 코딩 도구가 없다면

**하나만** 고르세요(하나면 충분합니다):
- **[Cursor](https://cursor.com)** — 가장 간단한 선택지: AI 채팅이 처음부터 내장된 완전한 코드 에디터입니다. 다른 일반 앱처럼 다운로드하여 설치하면 됩니다.
- **Claude Code** — 이미 VS Code를 사용 중이라면 VS Code 마켓플레이스에서 확장 프로그램을 설치하거나, [claude.com/code](https://claude.com/code)에서 독립 실행형 CLI를 받으세요.
- **Codex** 또는 **Gemini CLI** — 이미 OpenAI나 Google의 코딩 도구를 사용 중이라면.

설치가 끝나면 도구를 열고, 프로젝트용 폴더를 열거나 새로 만든 뒤 위의 1단계로 진행하세요.

---

### Firebase 설정: 경로 B에서의 의미

경로 B의 어느 시점에서 AI는 **Firebase** 프로젝트(실시간 백엔드를 실행하는 구글의 서비스)를 연결해야 합니다. 어떤 것이 적합한지는 **개인적으로 학습/구축**만 하고 싶은지, 아니면 **다른 사람들이 실제로 사용**하게 하고 싶은지에 따라 달라집니다.

| 목표 | 사용할 것 | 신용카드 필요 여부 | URL로 다른 사람이 참여 가능한가? |
|---|---|---|---|
| 학습, 실험, 아이가 직접 만들고 테스트하게 하기 | **Firebase 에뮬레이터**(내 컴퓨터에서 실행) | **카드 불필요** | 아니요 — 로컬 전용 |
| 실제 사람들이 자신의 휴대폰으로 참여하게 하기 | **Firebase Blaze 플랜** | **필요, 신용카드 등록 필수** | 예 |

- **개인적인 학습/구축 → 에뮬레이터.** 내 컴퓨터에서 완전히 실행되며 무료이고 **신용카드가 필요 없습니다.** 여러 가지를 시도해 보거나 아이가 AI로 개발을 배우기에 완벽합니다. 유일한 제약은 로컬 환경이라 다른 사람에게 링크를 보낼 수 없다는 점입니다.
- **실제 게스트와 함께 정식 서비스 → Blaze 플랜.** 백엔드(Cloud Functions)를 인터넷에 공개하려면 Firebase는 **Blaze(사용한 만큼 지불) 플랜을 요구하며, 이 플랜은 신용카드 등록이 필요합니다.** 무료 한도가 넉넉하기 때문에(월 약 200만 건의 함수 호출까지 무료) 소규모 행사는 대개 비용이 들지 않지만, **이를 활성화하려면 카드 등록이 필요합니다.** Firebase 콘솔에서 반드시 예산 알림을 설정하세요.
- **애초에 왜 카드가 필요한가요?** 안전을 위해 snap-pair는 방 생성과 참여를 브라우저가 아니라 서버(Cloud Functions)에서 검사합니다. Firebase는 무료(Spark) 플랜에서는 Cloud Functions 게시를 허용하지 않으며, Blaze 플랜에서만 가능합니다. 이는 Firebase 자체의 규칙이지 snap-pair의 제약이 아닙니다. 카드를 추가하고 싶지 않다면, 공개 링크 공유를 제외한 모든 작업을 에뮬레이터로 그대로 수행할 수 있습니다.

위 2단계의 두 MCP 서버가 프로젝트 생성, 필요한 기능 활성화, `.env` 작성까지 대신 처리합니다 — Firebase 콘솔을 직접 클릭하며 다닐 필요가 없습니다. 무엇이 자동화되고 무엇이 수동 단계로 남는지에 대한 전체 설명은 [`SKILL.md`](./SKILL.md#firebase-setup-mcp-automation-vs-manual)를 참고하세요.

---

### 경로 C: 소스 코드 직접 다루기 (엔지니어용)

실제 소스 코드를 읽거나, 수정하거나, 기여하기 위한 경로입니다. 아래 **"엔지니어를 위한 안내"** 섹션을 참고하세요. 이 경로는 코드 자체를 다루는 것이므로 저장소 다운로드(`git clone` 또는 GitHub의 "Download ZIP")가 필요합니다 — 지침만으로 AI가 새 앱을 생성해 주는 경로 B와는 다릅니다.

---

## 엔지니어를 위한 안내

`snap-pair-core`는 QR 코드나 6자리 코드를 통해 브라우저를 임시로 페어링하기 위한 React/Firebase Realtime Database 기반 프레임워크이며, 최대 300명의 참가자가 있는 방에 대해 프레즌스(presence)와 경량 공유 상태를 제공합니다.

프로덕션 환경은 서버 지원(server-assisted) 방식입니다. Firebase Auth가 각 브라우저를 식별하고, Cloud Functions가 방을 생성하고 참가자를 승인하며, RTDB 보안 규칙은 승인된 방 멤버만 범위가 좁게 제한된 필드를 구독하거나 업데이트할 수 있도록 합니다. 짧은 페어링 코드는 방을 찾는 용도일 뿐, **인가(authorization) 자격 증명이 아닙니다.**

### 아키텍처

- **React 18 훅**(`src/hooks/useSnapPair.ts`): 인증 준비 상태, 방 구독, 자신의 프레즌스, 범위가 제한된 상태 업데이트, 나가기(leave) 동작을 처리합니다.
- **타입**(`src/types/index.ts`): `SnapPlayer`, `SnapRoom`, 페어링 관련 타입.
- **호출 가능한 Cloud Functions**(`functions/src/`): `createSnapRoom`, `joinSnapRoom`, 그리고 예약 실행되는 `cleanupExpiredData`.
- **보안 규칙**(`database.rules.json`): 멤버십 기반 읽기 제한과 범위가 제한된 클라이언트 쓰기. 방 전체에 대한 광범위한 쓰기는 허용되지 않습니다.

방 생성과 참여는 `functions/` 내의 Admin SDK 경로를 거칩니다. 브라우저는 페어링 코드 레코드를 읽거나, 방을 직접 생성하거나, 멤버십/정원 레코드를 쓸 수 없습니다.

### React 사용법

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

`createRoom(initialState)`나 `joinRoom(code)`를 호출하기 전에 `authReady`를 기다리세요. 두 함수 모두 신뢰할 수 있는 서버 함수를 호출합니다. 서버가 `roomMembers/{roomId}/{uid}`를 영구 저장한 후에야 훅이 해당 방을 읽고 구독할 수 있습니다.

멤버는 공유되는 `state`, 자신의 `name`, `connected`, `lastSeenAt`, 그리고 `meta/updatedAt`을 업데이트할 수 있습니다. 방 상태를 변경할 수 있는 것은 호스트뿐입니다. ID, 역할, 참여 타임스탬프, 멤버십, 정원, 페어링 코드, `joinState`는 항상 서버가 권한을 가집니다.

`state`는 의도적으로 범용적으로 설계되어 있어 제품별 스키마를 검증하지 않으며, 페이로드 크기나 쓰기 빈도 제한을 보장하지도 않습니다. 각 제품은 프로덕션에 배포하기 전에 자신의 데이터와 트래픽에 맞는 상태 검증, 페이로드 제한, 클라이언트/서버 쓰로틀링을 추가해야 합니다.

### 데이터 구조

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

## Firebase 설정: 세 가지 방법

공유 가능한 URL이 필요한지, 그리고 카드를 등록할 수 있는지에 따라 선택하세요.

### 1. 에뮬레이터 — 무료, 신용카드 불필요, 로컬 전용(학습에 가장 적합)

Firebase Emulator Suite는 Auth, Realtime Database, Cloud Functions를 모두 여러분의 컴퓨터에서 실행합니다. 결제 계정도, 카드도 필요 없습니다.

```bash
npm install
npm --prefix functions install
npm --prefix functions run build
npx firebase-tools emulators:start --only auth,database,functions
```

모든 것이 로컬에서 실행됩니다. 에뮬레이터로는 다른 사람에게 공개 링크를 줄 수 없습니다 — 이는 개발과 학습을 위한 것입니다.

### 2. Spark(무료) 플랜 — 할 수 있는 것과 할 수 없는 것

Spark 플랜은 **신용카드가 필요 없으며**, Firebase Hosting을 통해 공개 사이트를 제공하고, Realtime Database는 **최대 100개의 동시 연결**이라는 엄격한 상한선 내에서 사용할 수 있습니다. **하지만 Spark는 Cloud Functions를 배포할 수 없습니다** — 그리고 snap-pair는 안전한 방 생성과 참여를 위해 Cloud Functions에 의존합니다. 따라서 Spark만으로는 전체 서버 지원 설계를 공개적으로 운영하기에 충분하지 않습니다.

### 3. Blaze(사용한 만큼 지불) 플랜 — 정식 서비스에 필수(신용카드 필요)

Cloud Functions를 공개 인터넷에 배포하려면 프로젝트가 **Blaze 플랜이어야 하며, 이는 신용카드/결제 계정 등록을 필요로 합니다.** Blaze 플랜에서도 무료 할당량은 유지되며(**월 약 200만 건의 함수 호출**이 무료, RTDB는 최대 **20만 개의 동시 연결**까지 가능), 이를 초과하는 부분에 대해서만 과금되므로 소규모 행사는 대개 비용이 들지 않습니다 — 하지만 **이를 활성화하려면 카드 등록이 반드시 필요합니다.**

```bash
npm --prefix functions run build
firebase use YOUR_EXISTING_PROJECT
firebase deploy --only functions
firebase deploy --only database
```

두 호출 가능 함수 모두 **Firebase App Check**를 강제합니다. 실제 프로젝트를 대상으로 로컬 개발을 할 때는 디버그 토큰을 설정하고, 배포된 호출 가능 함수에서는 절대로 이 검증을 비활성화하지 마세요. Firebase 콘솔 → Usage and billing(사용량 및 결제)에서 반드시 **예산 알림을 설정하세요.** (예산 알림은 알려주기만 할 뿐 비용에 대한 강제 상한을 두지는 않습니다. 강제 차단이 필요하다면 별도의 커스텀 결제 함수가 필요합니다.)

---

## 검증

```bash
npm test
npm run typecheck
npm --prefix functions test
npm --prefix functions run typecheck
npm run test:rules-emulator
```

## AI 에이전트 스킬

[`SKILL.md`](./SKILL.md)는 AI 코딩 에이전트가 새로운 제품을 위해 올바르고 서버 지원 방식의 snap-pair 통합을 생성할 수 있게 해줍니다. 이 파일을 여러분의 에이전트의 스킬 디렉터리에 복사하세요. 비공개 입력, 집계 결과 일괄 공개, 커밋먼트 임계값(commitment-threshold) 패턴에 대해서는 [`references/one-room-one-decision.md`](./references/one-room-one-decision.md)를 참고하세요.

## 결제

결제 기능은 이 기반 프레임워크의 범위 밖입니다. 제품에 결제가 필요하다면, 멤버십 확인과 결제 제공업체의 웹훅 검증을 포함하는 별도의 신뢰할 수 있는 서버 통합을 추가하세요.

## 라이선스

MIT — 자세한 내용은 [LICENSE](./LICENSE)를 참고하세요.
