import { useMemo, useRef, useState } from 'react';
import { sendToHost, throttle, useControllerRoom } from './snap';
import { ControllerShell } from './ui';

const MAX_PER_SECOND = 10;

/** Phone: tap for a small burst, swipe fast for a big one. */
export default function Controller() {
  const room = useControllerRoom<null>();
  const [hue] = useState(() => Math.floor(Math.random() * 360));
  const start = useRef<{ x: number; y: number; t: number } | null>(null);
  const fire = useMemo(
    () => throttle((payload: { x: number; y: number; power: number; hue: number }) => sendToHost(room.transport, 'blast', payload), 1000 / MAX_PER_SECOND),
    [room.transport],
  );

  return (
    <ControllerShell {...room} orientation="portrait">
      <div
        className="pad center"
        style={{ background: `radial-gradient(circle, hsl(${hue}, 80%, 30%), #0b0d12)` }}
        onPointerDown={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          start.current = { x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height, t: performance.now() };
        }}
        onPointerUp={(event) => {
          const from = start.current;
          start.current = null;
          if (!from) return;
          const rect = event.currentTarget.getBoundingClientRect();
          const dx = (event.clientX - rect.left) / rect.width - from.x;
          const dy = (event.clientY - rect.top) / rect.height - from.y;
          const seconds = Math.max(0.05, (performance.now() - from.t) / 1000);
          const power = Math.min(1, Math.hypot(dx, dy) / seconds / 3);
          fire({ x: from.x, y: from.y, power, hue });
        }}
      >
        <p style={{ fontSize: 24 }}>Tap or swipe!</p>
      </div>
    </ControllerShell>
  );
}
