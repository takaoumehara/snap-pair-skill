import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Screen Wake Lock wrapper. Phones dim and lock while a controller page waits
 * for input; a wake lock keeps the screen on. Browsers release the lock when
 * the page is hidden, so the controller re-acquires it when the page becomes
 * visible again. Everything degrades to a no-op where the API is missing
 * (older Safari, insecure contexts, SSR); nothing touches `window` at import.
 */

interface WakeLockSentinelLike {
  readonly released?: boolean;
  release(): Promise<void>;
  addEventListener?(type: 'release', listener: () => void): void;
  removeEventListener?(type: 'release', listener: () => void): void;
}

interface WakeLockLike {
  request(type: 'screen'): Promise<WakeLockSentinelLike>;
}

const getWakeLockApi = (): WakeLockLike | undefined =>
  typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;

/** True when `navigator.wakeLock.request` exists. Safe during SSR. */
export function isWakeLockSupported(): boolean {
  return typeof getWakeLockApi()?.request === 'function';
}

export interface WakeLockOptions {
  /** Re-acquire after the page becomes visible again. Default: true. */
  autoReacquire?: boolean;
  /** Called whenever `active` changes. */
  onChange?: (active: boolean) => void;
  /** Called when a request fails (e.g. `NotAllowedError` on low battery). */
  onError?: (error: Error) => void;
}

export interface WakeLockController {
  readonly supported: boolean;
  /** True while the screen lock is held. */
  readonly active: boolean;
  /** Last request failure, if any. */
  readonly lastError: Error | null;
  /** Requests the lock and keeps wanting it until `release()`. Resolves `false` if unsupported or refused. */
  request(): Promise<boolean>;
  /** Releases the lock and stops re-acquiring it. */
  release(): Promise<void>;
  /** `release()` plus removal of the visibility listener. */
  dispose(): Promise<void>;
}

export function createWakeLock({ autoReacquire = true, onChange, onError }: WakeLockOptions = {}): WakeLockController {
  let sentinel: WakeLockSentinelLike | null = null;
  let wanted = false;
  let active = false;
  let lastError: Error | null = null;
  let pending: Promise<boolean> | null = null;
  let listening = false;

  const setActive = (next: boolean) => {
    if (next === active) return;
    active = next;
    onChange?.(next);
  };

  const onRelease = () => {
    sentinel?.removeEventListener?.('release', onRelease);
    sentinel = null;
    setActive(false);
  };

  const onVisibilityChange = () => {
    if (wanted && !sentinel && document.visibilityState === 'visible') void acquire();
  };

  const listen = (on: boolean) => {
    if (typeof document === 'undefined' || on === listening) return;
    listening = on;
    if (on) document.addEventListener('visibilitychange', onVisibilityChange);
    else document.removeEventListener('visibilitychange', onVisibilityChange);
  };

  const acquire = (): Promise<boolean> => {
    const api = getWakeLockApi();
    if (!api || typeof api.request !== 'function') return Promise.resolve(false);
    if (sentinel) return Promise.resolve(true);
    if (pending) return pending;
    pending = api.request('screen').then(
      (lock) => {
        pending = null;
        if (!wanted) {
          // release() ran while the request was in flight.
          void lock.release().catch(() => undefined);
          return false;
        }
        sentinel = lock;
        lock.addEventListener?.('release', onRelease);
        lastError = null;
        setActive(true);
        return true;
      },
      (error: unknown) => {
        pending = null;
        lastError = error instanceof Error ? error : new Error(String(error));
        onError?.(lastError);
        return false;
      },
    );
    return pending;
  };

  return {
    get supported() { return isWakeLockSupported(); },
    get active() { return active; },
    get lastError() { return lastError; },
    request() {
      wanted = true;
      if (autoReacquire) listen(true);
      return acquire();
    },
    async release() {
      wanted = false;
      const lock = sentinel;
      if (lock) {
        lock.removeEventListener?.('release', onRelease);
        sentinel = null;
        try {
          await lock.release();
        } catch {
          // Already released by the browser.
        }
      }
      setActive(false);
    },
    async dispose() {
      listen(false);
      await this.release();
    },
  };
}

/**
 * Holds a screen wake lock while `enabled` is true. Some browsers only grant
 * the first request after a user gesture; it is retried on every visibility
 * change, and you can call `request()` from a tap handler.
 */
export function useWakeLock(enabled = true): { supported: boolean; active: boolean; request: () => Promise<boolean> } {
  const [active, setActive] = useState(false);
  const lockRef = useRef<WakeLockController | null>(null);

  useEffect(() => {
    if (!enabled) return undefined;
    const lock = createWakeLock({ onChange: setActive });
    lockRef.current = lock;
    void lock.request();
    return () => {
      if (lockRef.current === lock) lockRef.current = null;
      void lock.dispose();
    };
  }, [enabled]);

  const request = useCallback(() => lockRef.current?.request() ?? Promise.resolve(false), []);
  return { supported: isWakeLockSupported(), active, request };
}
