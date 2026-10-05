import { useRef, useState } from 'react';
import { sendToHost, useControllerRoom } from './snap';
import { ControllerShell } from './ui';

const MIN_INTERVAL_MS = 500; // at most 2 throws per second
const MAX_TEXT = 140;

/** Phone: type a message, then flick the card up (or tap Throw). */
export default function Controller() {
  const room = useControllerRoom<null>();
  const [text, setText] = useState('');
  const [color] = useState(() => `hsl(${Math.floor(Math.random() * 360)}, 90%, 70%)`);
  const lastThrow = useRef(0);
  const swipe = useRef<{ x: number; y: number; t: number } | null>(null);

  const fling = (vx: number, vy: number) => {
    const message = text.trim().slice(0, MAX_TEXT);
    if (!message || Date.now() - lastThrow.current < MIN_INTERVAL_MS) return;
    lastThrow.current = Date.now();
    sendToHost(room.transport, 'throw', { text: message, vx, vy, color });
    setText('');
  };

  return (
    <ControllerShell {...room} orientation="portrait">
      <div className="center">
        <input
          value={text}
          maxLength={MAX_TEXT}
          placeholder="Say something…"
          style={{ textTransform: 'none', letterSpacing: 0 }}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => { if (event.key === 'Enter') fling(0, -1); }}
        />
        <div
          className="pad"
          style={{ width: '100%', minHeight: 200, borderRadius: 16, background: '#151922', display: 'grid', placeItems: 'center', color }}
          onPointerDown={(event) => { swipe.current = { x: event.clientX, y: event.clientY, t: performance.now() }; }}
          onPointerUp={(event) => {
            const from = swipe.current;
            swipe.current = null;
            if (!from) return;
            const seconds = Math.max(0.05, (performance.now() - from.t) / 1000);
            const vx = (event.clientX - from.x) / window.innerWidth / seconds;
            const vy = (event.clientY - from.y) / window.innerHeight / seconds;
            if (vy < -0.5) fling(Math.max(-1, Math.min(1, vx)), Math.max(-2, vy));
          }}
        >
          {text || '↑ flick up to throw'}
        </div>
        <button type="button" onClick={() => fling(0, -1)} disabled={!text.trim()}>Throw</button>
      </div>
    </ControllerShell>
  );
}
