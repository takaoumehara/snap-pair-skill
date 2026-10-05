import { useEffect, useRef } from 'react';
import { clamp, peerCount, send, useHostRoom, useMessages, useTransportStatus } from './snap';
import { HostLayout } from './ui';

/** `stroke` payload: points normalized to 0..1, sent in batches (see the preset's rate limit). */
interface Stroke {
  id: string;
  color: string;
  width: number;
  points: [number, number][];
  end?: boolean;
}

const INITIAL_STATE = { background: '#0b0d12' };
const MAX_POINTS = 64;
const COLOR = /^(#[0-9a-f]{3,8}|hsl\([\d.\s%,]+\))$/i;

/** Big screen: draws every guest's strokes as they stream in. */
export default function Host() {
  const { transport, snap, pairing } = useHostRoom(INITIAL_STATE);
  const status = useTransportStatus(transport);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Last drawn point per `${peer}:${stroke}`, so batches join up seamlessly. */
  const tails = useRef(new Map<string, [number, number]>());

  useEffect(() => {
    const canvas = canvasRef.current!;
    const resize = () => {
      // Resizing clears the bitmap; fine for a demo.
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  useMessages<Stroke>(transport, 'stroke', (stroke, message) => {
    const ctx = canvasRef.current?.getContext('2d');
    // Payloads come from other devices: validate before drawing.
    if (!ctx || !stroke || typeof stroke.id !== 'string' || !Array.isArray(stroke.points)) return;
    const points = stroke.points.slice(0, MAX_POINTS).map(([x, y]) => [clamp(x, 0, 1), clamp(y, 0, 1)] as [number, number]);
    if (points.length === 0) return;
    const key = `${message.from}:${stroke.id}`;
    const { width, height } = ctx.canvas;
    ctx.strokeStyle = typeof stroke.color === 'string' && COLOR.test(stroke.color) ? stroke.color : '#ffffff';
    ctx.lineWidth = clamp(stroke.width, 1, 40, 4) * devicePixelRatio;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    const start = tails.current.get(key) ?? points[0];
    ctx.moveTo(start[0] * width, start[1] * height);
    for (const [x, y] of points) ctx.lineTo(x * width, y * height);
    ctx.stroke();
    if (stroke.end) tails.current.delete(key);
    else tails.current.set(key, points[points.length - 1]);
  });

  const clear = () => {
    const ctx = canvasRef.current?.getContext('2d');
    ctx?.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    tails.current.clear();
    send(transport, 'clear', {});
  };

  return (
    <HostLayout pairing={pairing} peers={peerCount(snap.room)} status={status}>
      <canvas ref={canvasRef} style={{ background: INITIAL_STATE.background }} />
      <button type="button" onClick={clear} style={{ position: 'absolute', left: 16, top: 16 }}>Clear</button>
      {snap.error && <p role="alert" style={{ position: 'absolute', left: 16, bottom: 16 }}>{snap.error}</p>}
    </HostLayout>
  );
}
