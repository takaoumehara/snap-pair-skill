import { useEffect, useRef } from 'react';
import { clamp, peerCount, useHostRoom, useMessages, useTransportStatus } from './snap';
import { HostLayout } from './ui';

/** `input` payload: stick in -1..1, buttons bitmask (A = 1, B = 2), seq increases per sender. */
interface Input { seq: number; x: number; y: number; buttons: number }
interface Player { x: number; y: number; input: Input; hue: number; name: string }

const SPEED = 0.006;
const STALE_MS = 1000; // no input for 1 s (lost "release") -> stop

/** Big screen: a tiny game where every phone drives a dot; A makes it pulse. */
export default function Host() {
  const { transport, snap, pairing } = useHostRoom(null);
  const status = useTransportStatus(transport);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const players = useRef(new Map<string, Player & { seenAt: number }>());

  useMessages<Input>(transport, 'input', (input, message) => {
    const id = message.from;
    if (!id || !input) return;
    const known = players.current.get(id);
    // Drop out-of-order input (relays may reorder across reconnects).
    if (known && typeof input.seq === 'number' && input.seq <= known.input.seq) return;
    const clean: Input = { seq: clamp(input.seq, 0, Number.MAX_SAFE_INTEGER), x: clamp(input.x, -1, 1, 0), y: clamp(input.y, -1, 1, 0), buttons: clamp(input.buttons, 0, 3, 0) | 0 };
    const name = snap.room?.players[id]?.name ?? 'Player';
    players.current.set(id, known
      ? { ...known, input: clean, seenAt: Date.now() }
      : { x: Math.random(), y: Math.random(), hue: Math.floor(Math.random() * 360), name, input: clean, seenAt: Date.now() });
  });

  useEffect(() => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    let frame = 0;
    const loop = () => {
      if (canvas.width !== canvas.clientWidth) {
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
      }
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const now = Date.now();
      const present = transport.room?.players ?? {};
      for (const [id, p] of players.current) {
        if (!present[id]) { players.current.delete(id); continue; }
        const live = now - p.seenAt < STALE_MS;
        p.x = Math.min(1, Math.max(0, p.x + (live ? p.input.x : 0) * SPEED));
        p.y = Math.min(1, Math.max(0, p.y + (live ? p.input.y : 0) * SPEED));
        const radius = p.input.buttons & 1 && live ? 36 : 20;
        ctx.fillStyle = `hsl(${p.hue}, 90%, ${p.input.buttons & 2 && live ? 75 : 55}%)`;
        ctx.beginPath();
        ctx.arc(p.x * canvas.width, p.y * canvas.height, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.fillText(p.name, p.x * canvas.width - 20, p.y * canvas.height - radius - 6);
      }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [transport]);

  return (
    <HostLayout pairing={pairing} peers={peerCount(snap.room)} status={status}>
      <canvas ref={canvasRef} />
    </HostLayout>
  );
}
