import { useEffect, useRef, useState } from 'react';
import { clamp, peerCount, useHostRoom, useMessages, useTransportStatus } from './snap';
import { HostLayout } from './ui';

interface Throw { text: string; vx: number; vy: number; color: string }
interface Flying { id: number; text: string; color: string; x: number; y: number; vx: number; vy: number }

const MAX_ON_SCREEN = 100;
const MAX_TEXT = 140;
const COLOR = /^hsl\([\d.\s%,]+\)$/i;

/** Big screen: thrown messages fly in from the bottom and drift. */
export default function Host() {
  const { transport, snap, pairing } = useHostRoom(null);
  const status = useTransportStatus(transport);
  const [items, setItems] = useState<Flying[]>([]);
  const nextId = useRef(1);

  useMessages<Throw>(transport, 'throw', (payload) => {
    // Untrusted input: trim, cap length, and render as text (React escapes it).
    const text = typeof payload?.text === 'string' ? payload.text.trim().slice(0, MAX_TEXT) : '';
    if (!text) return;
    const item: Flying = {
      id: nextId.current++,
      text,
      color: typeof payload.color === 'string' && COLOR.test(payload.color) ? payload.color : '#fff',
      x: 0.2 + Math.random() * 0.6,
      y: 1,
      vx: clamp(payload.vx, -1, 1, 0) * 0.01,
      vy: -Math.max(0.004, clamp(-payload.vy, 0, 2, 1) * 0.01),
    };
    setItems((current) => [...current, item].slice(-MAX_ON_SCREEN));
  });

  useEffect(() => {
    let frame = 0;
    const loop = () => {
      setItems((current) => current.map((item) => {
        const vy = item.y < 0.15 ? item.vy * 0.9 : item.vy; // settle near the top
        return { ...item, x: Math.min(0.95, Math.max(0.05, item.x + item.vx)), y: Math.max(0.05, item.y + vy), vx: item.vx * 0.98, vy };
      }));
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <HostLayout pairing={pairing} peers={peerCount(snap.room)} status={status}>
      {items.map((item) => (
        <span
          key={item.id}
          style={{
            position: 'absolute',
            left: `${item.x * 100}%`,
            top: `${item.y * 100}%`,
            transform: 'translate(-50%, -50%)',
            color: item.color,
            fontSize: 28,
            fontWeight: 700,
            whiteSpace: 'nowrap',
            textShadow: '0 2px 8px rgba(0,0,0,0.6)',
          }}
        >
          {item.text}
        </span>
      ))}
    </HostLayout>
  );
}
