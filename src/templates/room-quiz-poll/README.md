# Room Quiz / Poll

The host shows a question; everyone in the room answers on their phone and the
tally updates live. Scales to a few hundred phones on PartyKit.

| | |
| --- | --- |
| Preset id | `room-quiz-poll` |
| Transports | **partykit** (recommended), broadcast, webrtc (small rooms only) |
| Pairing | PIN (default: easy to read aloud), QR, room code |
| Room size | 2–300 (typical 40) |

## Files

- `src/quiz.ts`: `QuizState`, `Vote`, and the sample questions. Edit `QUESTIONS`.
- `src/Host.tsx`: question, live bar chart, open/close voting, next question.
- `src/Controller.tsx`: one button per choice.

## Data

```ts
// shared state (host-authoritative, via transport.setState)
{ questionId: string; question: string; choices: string[]; open: boolean; tally: number[] }
// controller -> host
{ type: 'vote', payload: { questionId: string; choice: number } }
```

The host keeps the **latest vote per peer id** for the current question, so a
phone can change its answer but never vote twice, and it ignores votes for
closed or stale questions.

## Rate limits

Votes are rare, but 300 voters at once would mean 300 state broadcasts. The
host recomputes the tally on every vote but publishes it at most 4 times per
second (`throttle` in `src/snap.ts`).

## Trust

Relay transports are host-authoritative: anyone with the PIN can join. For
graded quizzes add an `admit` check (see `RelayTransportOptions`) or use the
Firebase room server, which admits peers server-side.

## Run

```bash
npm install
npx partykit dev   # local relay on :1999
npm run dev
```
