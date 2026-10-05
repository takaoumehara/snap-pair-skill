import { useEffect, useMemo, useState } from 'react';
import { subscribeMotion, subscribeOrientation, type Peer, type Transport } from 'snap-pair-core';
import { sendToHost, throttle, useControllerRoom } from './snap';
import { ControllerShell } from './ui';

const SEND_MS = 1000 / 30; // sensors fire at 60–100 Hz; 30/s is plenty
const SHAKE_FULL = 25; // m/s² of extra acceleration that counts as a full shake

/** Streams tilt and shake while sensor access is granted. */
function MotionStream({ enabled, transport }: { enabled: boolean; transport: Transport<Peer, null> }) {
  const [tilt, setTilt] = useState({ beta: 0, gamma: 0 });
  const push = useMemo(
    () => throttle((payload: { beta: number; gamma: number; shake: number }) => sendToHost(transport, 'motion', payload), SEND_MS),
    [transport],
  );

  useEffect(() => {
    if (!enabled) return undefined;
    let latest = { beta: 0, gamma: 0 };
    let shake = 0;
    const stopOrientation = subscribeOrientation(({ beta, gamma }) => {
      latest = { beta: beta ?? 0, gamma: gamma ?? 0 };
      setTilt(latest);
      push({ ...latest, shake });
      shake = 0;
    });
    const stopMotion = subscribeMotion(({ acceleration }) => {
      if (!acceleration) return;
      const magnitude = Math.hypot(acceleration.x ?? 0, acceleration.y ?? 0, acceleration.z ?? 0);
      shake = Math.max(shake, Math.min(1, magnitude / SHAKE_FULL));
      if (shake > 0.5) push({ ...latest, shake });
    });
    return () => {
      stopOrientation();
      stopMotion();
    };
  }, [enabled, push]);

  return (
    <div className="center">
      <p style={{ fontSize: 22 }}>{enabled ? 'Tilt and shake your phone' : 'Motion sensors are off'}</p>
      <div
        style={{
          width: 160,
          height: 160,
          borderRadius: 24,
          background: '#2b6cff',
          transform: `perspective(400px) rotateX(${-tilt.beta / 2}deg) rotateY(${tilt.gamma / 2}deg)`,
        }}
      />
    </div>
  );
}

/** Phone: ControllerWrapper shows the iOS permission button; sensors stream once granted. */
export default function Controller() {
  const room = useControllerRoom<null>();
  return (
    <ControllerShell {...room} motion orientation="portrait">
      {(context) => <MotionStream enabled={context.motionPermission === 'granted'} transport={room.transport} />}
    </ControllerShell>
  );
}
