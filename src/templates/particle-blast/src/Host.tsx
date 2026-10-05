import { useEffect, useRef } from 'react';
import { clamp, peerCount, useHostRoom, useMessages, useTransportStatus } from './snap';
import { HostLayout } from './ui';

interface Blast { x: number; y: number; power: number; hue: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; hue: number }

const MAX_PARTICLES = 2000;
const INITIAL_STATE = null;

/** Big screen: every `blast` becomes a burst of particles. */
export default function Host() {
  const { transport, snap, pairing } = useHostRoom(INITIAL_STATE);
  const status = useTransportStatus(transport);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particles = useRef<Particle[]>([]);

  useMessages<Blast>(transport, 'blast', (blast) => {
    if (!blast) return;
    const power = clamp(blast.power, 0, 1, 0.5);
    const count = Math.round(20 + power * 60);
    const x = clamp(blast.x, 0, 1, 0.5);
    const y = clamp(blast.y, 0, 1, 0.5);
    const hue = clamp(blast.hue, 0, 360, 200);
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (0.2 + Math.random() * 0.8) * (0.004 + power * 0.012);
      particles.current.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 1, hue: hue + Math.random() * 40 - 20 });
    }
    // Cap the system so a big room stays smooth.
    if (particles.current.length > MAX_PARTICLES) particles.current.splice(0, particles.current.length - MAX_PARTICLES);
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
      ctx.fillStyle = 'rgba(11, 13, 18, 0.25)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const alive: Particle[] = [];
      for (const p of particles.current) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.00012; // gravity
        p.life -= 0.012;
        if (p.life <= 0) continue;
        alive.push(p);
        ctx.fillStyle = `hsla(${p.hue}, 95%, 60%, ${p.life})`;
        ctx.fillRect(p.x * canvas.width, p.y * canvas.height, 3, 3);
      }
      particles.current = alive;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <HostLayout pairing={pairing} peers={peerCount(snap.room)} status={status}>
      <canvas ref={canvasRef} />
    </HostLayout>
  );
}
