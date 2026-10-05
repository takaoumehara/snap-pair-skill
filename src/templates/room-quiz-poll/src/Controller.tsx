import { useState } from 'react';
import type { QuizState, Vote } from './quiz';
import { sendToHost, useControllerRoom } from './snap';
import { ControllerShell } from './ui';

/** Phone: one button per choice; the latest tap counts. */
export default function Controller() {
  const room = useControllerRoom<QuizState>();
  const state = room.snap.room?.state;
  const [picked, setPicked] = useState<Record<string, number>>({});

  const vote = (choice: number) => {
    if (!state?.open) return;
    setPicked((current) => ({ ...current, [state.questionId]: choice }));
    sendToHost<Vote>(room.transport, 'vote', { questionId: state.questionId, choice });
  };

  return (
    <ControllerShell {...room} orientation="portrait">
      <div className="center" style={{ justifyContent: 'flex-start' }}>
        {state ? (
          <>
            <h2>{state.question}</h2>
            {state.choices.map((choice, i) => (
              <button
                key={choice}
                type="button"
                disabled={!state.open}
                aria-pressed={picked[state.questionId] === i}
                onClick={() => vote(i)}
                style={{
                  width: '100%',
                  padding: '1em',
                  fontSize: 20,
                  background: picked[state.questionId] === i ? '#12b76a' : '#2b6cff',
                }}
              >
                {choice}
              </button>
            ))}
            {!state.open && <p>Voting is closed.</p>}
          </>
        ) : (
          <p>Waiting for the first question…</p>
        )}
      </div>
    </ControllerShell>
  );
}
