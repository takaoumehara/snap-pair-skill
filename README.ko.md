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

**어떻게 사용하나요 (AI 코딩 도구 사용 시)?**
직접 코드를 작성할 필요가 **없습니다**. Claude Code, Cursor, Codex 등 **AI 코딩 어시스턴트**를 사용하면 됩니다.

1. 이 저장소와 [`SKILL.md`](./SKILL.md) 파일을 AI에게 제공합니다.
2. 예를 들어 이렇게 요청합니다. "snap-pair-core와 SKILL.md를 읽고, 게스트가 QR 코드로 참여하고 휴대폰으로 답하는 실시간 퀴즈 게임을 만들어줘."
3. AI가 SKILL.md에 정의된 안전하고 서버 지원 방식의 설계를 따라 앱을 생성해 줍니다.

**중요한 단계 하나: Firebase 설정.**
어느 시점에서 AI는 여러분에게 **Firebase** 프로젝트(실시간 백엔드를 실행하는 구글의 서비스)를 연결해달라고 요청할 것입니다. 이를 수행하는 방법은 세 가지가 있으며, 어떤 것이 적합한지는 **개인적으로 학습/구축**만 하고 싶은지, 아니면 **다른 사람들이 실제로 사용**하게 하고 싶은지에 따라 달라집니다.

| 목표 | 사용할 것 | 신용카드 필요 여부 | URL로 다른 사람이 참여 가능한가? |
|---|---|---|---|
| 학습, 실험, 아이가 직접 만들고 테스트하게 하기 | **Firebase 에뮬레이터**(내 컴퓨터에서 실행) | **카드 불필요** | 아니요 — 로컬 전용 |
| 실제 사람들이 자신의 휴대폰으로 참여하게 하기 | **Firebase Blaze 플랜** | **필요, 신용카드 등록 필수** | 예 |

- **개인적인 학습/구축 → 에뮬레이터.** 내 컴퓨터에서 완전히 실행되며 무료이고 **신용카드가 필요 없습니다.** 여러 가지를 시도해 보거나 아이가 AI로 개발을 배우기에 완벽합니다. 유일한 제약은 로컬 환경이라 다른 사람에게 링크를 보낼 수 없다는 점입니다.
- **실제 게스트와 함께 정식 서비스 → Blaze 플랜.** 백엔드(Cloud Functions)를 인터넷에 공개하려면 Firebase는 **Blaze(사용한 만큼 지불) 플랜을 요구하며, 이 플랜은 신용카드 등록이 필요합니다.** 무료 한도가 넉넉하기 때문에(월 약 200만 건의 함수 호출까지 무료) 소규모 행사는 대개 비용이 들지 않지만, **이를 활성화하려면 카드 등록이 필요합니다.** Firebase 콘솔에서 반드시 예산 알림을 설정하세요.
- **애초에 왜 카드가 필요한가요?** 안전을 위해 snap-pair는 방 생성과 참여를 브라우저가 아니라 서버(Cloud Functions)에서 검사합니다. Firebase는 무료(Spark) 플랜에서는 Cloud Functions 게시를 허용하지 않으며, Blaze 플랜에서만 가능합니다. 이는 Firebase 자체의 규칙이지 snap-pair의 제약이 아닙니다. 카드를 추가하고 싶지 않다면, 공개 링크 공유를 제외한 모든 작업을 에뮬레이터로 그대로 수행할 수 있습니다.

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
