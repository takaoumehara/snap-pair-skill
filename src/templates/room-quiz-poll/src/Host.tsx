import { useMemo, useRef, useState } from 'react';
import { INITIAL_STATE, questionState, type QuizState, type Vote } from './quiz';
import { peerCount, throttle, useHostRoom, useMessages, useTransportStatus } from './snap';
import { HostLayout } from './ui';

const TALLY_PUBLISH_MS = 250; // ≤ 4 state broadcasts per second, however many people vote

/** Big screen: shows the question and a live bar chart; the host owns the tally. */
export default function Host() {
  const { transport, snap, pairing } = useHostRoom<QuizState>(INITIAL_STATE);
  const status = useTransportStatus(transport);
  const state = snap.room?.state ?? INITIAL_STATE;
  const [index, setIndex] = useState(0);
  /** Latest vote per peer for the current question: re-voting changes the answer, never double-counts. */
  const votes = useRef(new Map<string, number>());

  const publish = useMemo(() => throttle(() => {
    const current = transport.room?.state as QuizState | undefined;
    if (!current) return;
    const tally = current.choices.map(() => 0);
    for (const choice of votes.current.values()) tally[choice] += 1;
    void transport.setState({ ...current, tally });
  }, TALLY_PUBLISH_MS), [transport]);

  useMessages<Vote>(transport, 'vote', (vote, message) => {
    const current = transport.room?.state as QuizState | undefined;
    if (!current?.open || !message.from || vote?.questionId !== current.questionId) return;
    if (!Number.isInteger(vote.choice) || vote.choice < 0 || vote.choice >= current.choices.length) return;
    votes.current.set(message.from, vote.choice);
    publish();
  });

  const next = () => {
    votes.current.clear();
    setIndex(index + 1);
    void snap.updateState(questionState(index + 1));
  };
  const toggleOpen = () => void snap.updateState({ ...state, open: !state.open });

  const total = state.tally.reduce((sum, n) => sum + n, 0);
  return (
    <HostLayout pairing={pairing} peers={peerCount(snap.room)} status={status}>
      <section style={{ padding: '6vh 6vw', maxWidth: 1100 }}>
        <h1 style={{ fontSize: '4vh' }}>{state.question}</h1>
        {state.choices.map((choice, i) => {
          const share = total ? state.tally[i] / total : 0;
          return (
            <div key={choice} style={{ margin: '2vh 0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '2.6vh' }}>
                <span>{choice}</span>
                <span>{state.tally[i]}</span>
              </div>
              <div style={{ height: '3vh', background: '#1c2230', borderRadius: 8 }}>
                <div style={{ width: `${share * 100}%`, height: '100%', background: '#2b6cff', borderRadius: 8, transition: 'width 200ms' }} />
              </div>
            </div>
          );
        })}
        <p>{total} votes · {state.open ? 'voting open' : 'voting closed'}</p>
        <div style={{ display: 'flex', gap: 12 }}>
          <button type="button" onClick={toggleOpen}>{state.open ? 'Close voting' : 'Reopen voting'}</button>
          <button type="button" onClick={next}>Next question</button>
        </div>
      </section>
    </HostLayout>
  );
}
