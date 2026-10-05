import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { sendToHost, useControllerRoom, useMessages } from './snap';
import { ControllerShell } from './ui';

const FLUSH_MS = 33; // ≈30 messages/s while drawing
const MAX_POINTS = 64;
const WIDTH = 4;

/** Phone: a drawing pad whose points are batched and streamed to the host. */
export default function Controller() {
  const room = useControllerRoom<{ background: string }>();
  const [color] = useState(() => `hsl(${Math.floor(Math.random() * 360)}, 90%, 60%)`);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stroke = useRef<{ id: string; buffer: [number, number][]; last: [number, number] | null } | null>(null);

  const flush = (end = false) => {
    const current = stroke.current;
    if (!current || !current.last || (current.buffer.length === 0 && !end)) return;
    do {
      const points = current.buffer.splice(0, MAX_POINTS);
      const done = end && current.buffer.length === 0;
      sendToHost(room.transport, 'stroke', { id: current.id, color, width: WIDTH, points: points.length ? points : [current.last], ...(done ? { end: true } : {}) });
    } while (current.buffer.length > 0);
  };

  useEffect(() => {
    const timer = setInterval(() => flush(), FLUSH_MS);
    return () => clearInterval(timer);
  });

  useMessages(room.transport, 'clear', () => {
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  });

  const toPoint = (event: PointerEvent<HTMLCanvasElement>): [number, number] => {
    const rect = event.currentTarget.getBoundingClientRect();
    return [(event.clientX - rect.left) / rect.width, (event.clientY - rect.top) / rect.height];
  };

  const drawLocal = (from: [number, number], to: [number, number]) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    if (canvas.width !== canvas.clientWidth) {
      canvas.width = canvas.clientWidth;
      canvas.height = canvas.clientHeight;
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = WIDTH;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(from[0] * canvas.width, from[1] * canvas.height);
    ctx.lineTo(to[0] * canvas.width, to[1] * canvas.height);
    ctx.stroke();
  };

  return (
    <ControllerShell {...room} orientation="portrait">
      <canvas
        ref={canvasRef}
        className="pad"
        style={{ background: '#151922' }}
        onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          const point = toPoint(event);
          stroke.current = { id: Math.random().toString(36).slice(2, 10), buffer: [point], last: point };
        }}
        onPointerMove={(event) => {
          const current = stroke.current;
          if (!current) return;
          const point = toPoint(event);
          if (current.last) drawLocal(current.last, point);
          current.buffer.push(point);
          current.last = point;
        }}
        onPointerUp={() => {
          flush(true);
          stroke.current = null;
        }}
        onPointerCancel={() => {
          flush(true);
          stroke.current = null;
        }}
      />
    </ControllerShell>
  );
}
