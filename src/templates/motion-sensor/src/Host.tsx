import { useEffect, useRef } from 'react';
import { clamp, peerCount, useHostRoom, useMessages, useTransportStatus } from './snap';
import { HostLayout } from './ui';

/** `motion` payload: tilt in degrees from DeviceOrientation, shake 0..1. */
interface Motion { beta: number; gamma: number; shake: number }
interface Ball { x: number; y: number; vx: number; vy: number; tiltX: number; tiltY: number; flash: number; hue: number }

const SMOOTHING = 0.2; // low-pass filter for noisy sensors

/** Big screen: each phone tilts its own ball around; shaking makes it flash. */
export default function Host() {
  const { transport, snap, pairing } = useHostRoom(null);
  const status = useTransportStatus(transport);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const balls = useRef(new Map<string, Ball>());

  useMessages<Motion>(transport, 'motion', (motion, message) => {
    if (!message.from || !motion) return;
    const ball = balls.current.get(message.from)
      ?? { x: 0.5, y: 0.5, vx: 0, vy: 0, tiltX: 0, tiltY: 0, flash: 0, hue: Math.floor(Math.random() * 360) };
    // gamma (left/right) and beta (front/back), mapped to -1..1 at ±45°.
    const tiltX = clamp(motion.gamma, -45, 45, 0) / 45;
    const tiltY = clamp(motion.beta, -45, 45, 0) / 45;
    ball.tiltX += (tiltX - ball.tiltX) * SMOOTHING;
    ball.tiltY += (tiltY - ball.tiltY) * SMOOTHING;
    ball.flash = Math.max(ball.flash, clamp(motion.shake, 0, 1, 0));
    balls.current.set(message.from, ball);
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
      ctx.fillStyle = '#0b0d12';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const present = transport.room?.players ?? {};
      for (const [id, b] of balls.current) {
        if (!present[id]) { balls.current.delete(id); continue; }
        b.vx = (b.vx + b.tiltX * 0.0008) * 0.97;
        b.vy = (b.vy + b.tiltY * 0.0008) * 0.97;
        b.x = Math.min(1, Math.max(0, b.x + b.vx));
        b.y = Math.min(1, Math.max(0, b.y + b.vy));
        b.flash *= 0.9;
        ctx.fillStyle = `hsl(${b.hue}, 90%, ${55 + b.flash * 40}%)`;
        ctx.beginPath();
        ctx.arc(b.x * canvas.width, b.y * canvas.height, 24 + b.flash * 30, 0, Math.PI * 2);
        ctx.fill();
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
