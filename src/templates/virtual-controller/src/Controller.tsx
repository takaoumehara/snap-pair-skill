import { useEffect, useRef, type CSSProperties } from 'react';
import { sendToHost, useControllerRoom } from './snap';
import { ControllerShell } from './ui';

const MIN_INTERVAL_MS = 1000 / 60; // ≤ 60 messages/s
const KEEPALIVE_MS = 200; // 5/s while something is held, so a lost message self-heals

type Dir = 'up' | 'down' | 'left' | 'right';
const DIRS: Record<Dir, [number, number]> = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const BUTTONS = { A: 1, B: 2 } as const;

const padButton: CSSProperties = { width: 72, height: 72, fontSize: 28, touchAction: 'none' };

/** Phone (landscape): d-pad on the left, A/B on the right. Sends on change plus a keepalive. */
export default function Controller() {
  const room = useControllerRoom<null>();
  const held = useRef({ dirs: new Set<Dir>(), buttons: 0 });
  const seq = useRef(0);
  const lastSent = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const emit = () => {
    const { dirs, buttons } = held.current;
    let x = 0;
    let y = 0;
    for (const dir of dirs) {
      x += DIRS[dir][0];
      y += DIRS[dir][1];
    }
    seq.current += 1;
    lastSent.current = performance.now();
    sendToHost(room.transport, 'input', { seq: seq.current, x: Math.sign(x), y: Math.sign(y), buttons });
  };

  /** Rate-limited "send now"; trailing sends keep the host in sync with the latest state. */
  const changed = () => {
    const wait = lastSent.current + MIN_INTERVAL_MS - performance.now();
    if (timer.current) return;
    if (wait <= 0) emit();
    else timer.current = setTimeout(() => { timer.current = null; emit(); }, wait);
  };

  useEffect(() => {
    const keepalive = setInterval(() => {
      const { dirs, buttons } = held.current;
      if ((dirs.size > 0 || buttons) && performance.now() - lastSent.current >= KEEPALIVE_MS) emit();
    }, KEEPALIVE_MS);
    return () => clearInterval(keepalive);
  });

  const press = (update: () => void) => (event: { preventDefault(): void }) => {
    event.preventDefault();
    update();
    changed();
  };

  const dirButton = (dir: Dir, label: string) => (
    <button
      type="button"
      style={padButton}
      onPointerDown={press(() => held.current.dirs.add(dir))}
      onPointerUp={press(() => held.current.dirs.delete(dir))}
      onPointerCancel={press(() => held.current.dirs.delete(dir))}
      onPointerLeave={press(() => held.current.dirs.delete(dir))}
    >
      {label}
    </button>
  );

  const actionButton = (name: keyof typeof BUTTONS, background: string) => (
    <button
      type="button"
      style={{ ...padButton, borderRadius: '50%', background }}
      onPointerDown={press(() => { held.current.buttons |= BUTTONS[name]; })}
      onPointerUp={press(() => { held.current.buttons &= ~BUTTONS[name]; })}
      onPointerCancel={press(() => { held.current.buttons &= ~BUTTONS[name]; })}
    >
      {name}
    </button>
  );

  return (
    <ControllerShell {...room} orientation="landscape">
      <div className="pad" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-around' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 6 }}>
          <span />{dirButton('up', '▲')}<span />
          {dirButton('left', '◀')}<span />{dirButton('right', '▶')}
          <span />{dirButton('down', '▼')}<span />
        </div>
        <div style={{ display: 'flex', gap: 16 }}>
          {actionButton('B', '#f04438')}
          {actionButton('A', '#12b76a')}
        </div>
      </div>
    </ControllerShell>
  );
}
