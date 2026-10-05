import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { enterFullscreen, exitFullscreen, isFullscreenSupported, onFullscreenChange } from '../client/fullscreen';
import {
  isOrientationSupported,
  needsPermission,
  requestOrientationPermission,
  type ScreenOrientationLock,
  type SensorPermission,
} from '../client/orientation';
import { createWakeLock, isWakeLockSupported, type WakeLockController } from '../client/wakeLock';
import type { ConnectionStatus, Unsubscribe } from '../core/types';
import { detectLocale, getMessages, type Locale } from '../i18n';

export interface ControllerWrapperLabels {
  region: string;
  room: string;
  reconnect: string;
  connectionLost: string;
  wakeLockOn: string;
  wakeLockOff: string;
  enableMotion: string;
  motionDenied: string;
  motionUnsupported: string;
  fullscreen: string;
  exitFullscreen: string;
  status: Record<ConnectionStatus, string>;
}

/** Labels from the bundled dictionaries; `'auto'` uses `detectLocale()`. */
export function getControllerLabels(locale: Locale | 'auto' = 'en'): ControllerWrapperLabels {
  const messages = getMessages(locale === 'auto' ? detectLocale() : locale);
  return { ...messages.controller, status: { ...messages.hud.status } };
}

/** `'prompt'`: iOS needs a tap on the permission button first. */
export type MotionPermissionState = SensorPermission | 'prompt';

export interface ControllerContext {
  status: ConnectionStatus;
  /** `'granted'` once sensors may be read (immediately on browsers without a permission prompt). */
  motionPermission: MotionPermissionState;
  wakeLockActive: boolean;
  fullscreen: boolean;
}

/** Anything with `Transport`-style status reporting. */
export interface StatusSource {
  readonly status: ConnectionStatus;
  onStatus(listener: (status: ConnectionStatus) => void): Unsubscribe;
}

export interface ControllerWrapperProps {
  /** Connection status to show. Ignored when `transport` is given. */
  status?: ConnectionStatus;
  /** Follow a transport's status instead of passing `status`. */
  transport?: StatusSource;
  /** Shown in the status bar. */
  roomCode?: string;
  /** Shows a reconnect button while the link is down (e.g. rejoin the room). */
  onReconnect?: () => void;
  /** Keep the screen on (requested on mount and from the toggle). Default: true. */
  wakeLock?: boolean;
  /** Needs DeviceOrientation/Motion: shows the iOS permission button until granted. Default: false. */
  motion?: boolean;
  onMotionPermission?: (permission: SensorPermission) => void;
  /** Shows a fullscreen button that also tries to lock this orientation. */
  orientation?: ScreenOrientationLock;
  /** Default: English. */
  locale?: Locale | 'auto';
  labels?: Partial<Omit<ControllerWrapperLabels, 'status'>> & { status?: Partial<ControllerWrapperLabels['status']> };
  className?: string;
  style?: CSSProperties;
  /** Controller UI; a function receives the current `ControllerContext`. */
  children?: ReactNode | ((context: ControllerContext) => ReactNode);
}

const DOWN: ReadonlySet<ConnectionStatus> = new Set(['reconnecting', 'disconnected', 'error']);

const styles = {
  root: { display: 'flex', flexDirection: 'column', minHeight: '100%', fontFamily: 'system-ui, sans-serif' },
  bar: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', fontSize: 13, flexWrap: 'wrap' },
  spacer: { flex: 1 },
  banner: { display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: '#b42318', color: 'white', fontSize: 14 },
  notice: { padding: '8px 10px', fontSize: 14 },
  body: { flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 },
} satisfies Record<string, CSSProperties>;

/**
 * Phone-side shell for every preset: a status bar (room code, connection
 * state), a reconnect banner while the link is down, a screen wake lock
 * toggle, the iOS motion-permission button, and a fullscreen/orientation-lock
 * button. Each control hides itself where the browser lacks the API.
 */
export function ControllerWrapper({
  status: statusProp,
  transport,
  roomCode,
  onReconnect,
  wakeLock = true,
  motion = false,
  onMotionPermission,
  orientation,
  locale,
  labels: labelOverrides,
  className,
  style,
  children,
}: ControllerWrapperProps) {
  const base = getControllerLabels(locale ?? 'en');
  const labels: ControllerWrapperLabels = {
    ...base,
    ...labelOverrides,
    status: { ...base.status, ...labelOverrides?.status },
  };

  // ---- Connection status ----
  const [transportStatus, setTransportStatus] = useState<ConnectionStatus | undefined>(transport?.status);
  useEffect(() => {
    if (!transport) return undefined;
    return transport.onStatus(setTransportStatus);
  }, [transport]);
  const status: ConnectionStatus = (transport ? transportStatus : statusProp) ?? 'idle';

  // ---- Wake lock ----
  const lockRef = useRef<WakeLockController | null>(null);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [wakeSupported, setWakeSupported] = useState(false);
  useEffect(() => {
    if (!wakeLock) return undefined;
    setWakeSupported(isWakeLockSupported());
    const lock = createWakeLock({ onChange: setWakeLockActive });
    lockRef.current = lock;
    void lock.request();
    return () => {
      if (lockRef.current === lock) lockRef.current = null;
      void lock.dispose();
    };
  }, [wakeLock]);
  const toggleWakeLock = useCallback(() => {
    const lock = lockRef.current;
    if (!lock) return;
    if (lock.active) void lock.release();
    else void lock.request();
  }, []);

  // ---- Motion permission ----
  const [motionPermission, setMotionPermission] = useState<MotionPermissionState>('unsupported');
  useEffect(() => {
    if (!motion) return;
    if (!isOrientationSupported()) setMotionPermission('unsupported');
    else setMotionPermission(needsPermission() ? 'prompt' : 'granted');
  }, [motion]);
  const onMotionRef = useRef(onMotionPermission);
  onMotionRef.current = onMotionPermission;
  const askMotion = useCallback(() => {
    // Must stay synchronous up to the request: iOS only prompts inside the tap.
    void requestOrientationPermission().then((result) => {
      setMotionPermission(result);
      onMotionRef.current?.(result);
    });
  }, []);

  // ---- Fullscreen ----
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenSupported, setFullscreenSupported] = useState(false);
  useEffect(() => {
    if (!orientation) return undefined;
    setFullscreenSupported(isFullscreenSupported());
    return onFullscreenChange(setFullscreen);
  }, [orientation]);
  const toggleFullscreen = useCallback(() => {
    if (fullscreen) {
      void exitFullscreen().then(() => setFullscreen(false));
    } else {
      void enterFullscreen(orientation).then(({ fullscreen: entered }) => setFullscreen(entered));
    }
  }, [fullscreen, orientation]);

  const context: ControllerContext = { status, motionPermission, wakeLockActive, fullscreen };
  const showMotionGate = motion && motionPermission !== 'granted';

  return (
    <section
      className={className}
      style={{ ...styles.root, ...style }}
      aria-label={labels.region}
      data-snap-pair-controller=""
      data-status={status}
    >
      <div style={styles.bar}>
        {roomCode && <span data-snap-pair-room="">{labels.room}: <strong>{roomCode}</strong></span>}
        <span role="status" data-status={status}>{labels.status[status]}</span>
        <span style={styles.spacer} />
        {wakeLock && wakeSupported && (
          <button type="button" aria-pressed={wakeLockActive} onClick={toggleWakeLock}>
            {wakeLockActive ? labels.wakeLockOn : labels.wakeLockOff}
          </button>
        )}
        {orientation && fullscreenSupported && (
          <button type="button" aria-pressed={fullscreen} onClick={toggleFullscreen}>
            {fullscreen ? labels.exitFullscreen : labels.fullscreen}
          </button>
        )}
      </div>

      {DOWN.has(status) && (
        <div role="alert" style={styles.banner} data-snap-pair-reconnect="">
          <span style={styles.spacer}>{labels.connectionLost}</span>
          {onReconnect && <button type="button" onClick={onReconnect}>{labels.reconnect}</button>}
        </div>
      )}

      {showMotionGate && motionPermission === 'prompt' && (
        <div style={styles.notice}>
          <button type="button" onClick={askMotion} data-snap-pair-motion="">{labels.enableMotion}</button>
        </div>
      )}
      {showMotionGate && motionPermission === 'denied' && <p role="alert" style={styles.notice}>{labels.motionDenied}</p>}
      {showMotionGate && motionPermission === 'unsupported' && <p style={styles.notice}>{labels.motionUnsupported}</p>}

      <div style={styles.body}>{typeof children === 'function' ? children(context) : children}</div>
    </section>
  );
}
