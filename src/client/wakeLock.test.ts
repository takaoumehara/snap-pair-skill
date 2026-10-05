// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWakeLock, isWakeLockSupported, useWakeLock } from './wakeLock';

class FakeSentinel extends EventTarget {
  released = false;
  release = vi.fn(async () => {
    if (this.released) return;
    this.released = true;
    this.dispatchEvent(new Event('release'));
  });
}

let sentinels: FakeSentinel[];
let request: ReturnType<typeof vi.fn>;
let visibility: DocumentVisibilityState;

function installWakeLock(impl?: () => Promise<FakeSentinel>) {
  request = vi.fn(impl ?? (async () => {
    const sentinel = new FakeSentinel();
    sentinels.push(sentinel);
    return sentinel;
  }));
  Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true });
}

function setVisibility(state: DocumentVisibilityState) {
  visibility = state;
  document.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  sentinels = [];
  visibility = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibility });
});

afterEach(() => {
  delete (navigator as any).wakeLock;
});

describe('createWakeLock', () => {
  it('is a no-op where the API is missing', async () => {
    expect(isWakeLockSupported()).toBe(false);
    const lock = createWakeLock();
    expect(lock.supported).toBe(false);
    await expect(lock.request()).resolves.toBe(false);
    expect(lock.active).toBe(false);
    await expect(lock.release()).resolves.toBeUndefined();
  });

  it('requests and releases a screen lock', async () => {
    installWakeLock();
    const onChange = vi.fn();
    const lock = createWakeLock({ onChange });
    expect(lock.supported).toBe(true);

    await expect(lock.request()).resolves.toBe(true);
    expect(request).toHaveBeenCalledWith('screen');
    expect(lock.active).toBe(true);

    await lock.release();
    expect(sentinels[0].release).toHaveBeenCalled();
    expect(lock.active).toBe(false);
    expect(onChange.mock.calls).toEqual([[true], [false]]);
  });

  it('shares one in-flight request and reuses a held lock', async () => {
    installWakeLock();
    const lock = createWakeLock();
    await Promise.all([lock.request(), lock.request()]);
    await lock.request();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('re-acquires when the page becomes visible after the browser released the lock', async () => {
    installWakeLock();
    const lock = createWakeLock();
    await lock.request();

    setVisibility('hidden');
    await sentinels[0].release(); // Browsers release wake locks on hidden pages.
    expect(lock.active).toBe(false);

    setVisibility('visible');
    await vi.waitFor(() => expect(lock.active).toBe(true));
    expect(request).toHaveBeenCalledTimes(2);
  });

  it('does not re-acquire with autoReacquire: false, after release(), or after dispose()', async () => {
    installWakeLock();
    const manual = createWakeLock({ autoReacquire: false });
    await manual.request();
    await sentinels[0].release();
    setVisibility('visible');

    const released = createWakeLock();
    await released.request();
    await released.release();
    setVisibility('visible');

    const disposed = createWakeLock();
    await disposed.request();
    await disposed.dispose();
    setVisibility('visible');

    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it('reports refusals without throwing', async () => {
    const refusal = Object.assign(new Error('Low battery'), { name: 'NotAllowedError' });
    installWakeLock(() => Promise.reject(refusal));
    const onError = vi.fn();
    const lock = createWakeLock({ onError });
    await expect(lock.request()).resolves.toBe(false);
    expect(lock.lastError).toBe(refusal);
    expect(onError).toHaveBeenCalledWith(refusal);
  });

  it('releases a lock that is granted after release() was called', async () => {
    let grant!: (sentinel: FakeSentinel) => void;
    installWakeLock(() => new Promise((resolve) => { grant = resolve; }));
    const lock = createWakeLock();
    const pending = lock.request();
    await lock.release();
    const late = new FakeSentinel();
    grant(late);
    await expect(pending).resolves.toBe(false);
    expect(late.release).toHaveBeenCalled();
    expect(lock.active).toBe(false);
  });
});

describe('useWakeLock', () => {
  it('holds the lock while enabled and releases it on unmount', async () => {
    installWakeLock();
    const { result, rerender, unmount } = renderHook(({ enabled }) => useWakeLock(enabled), { initialProps: { enabled: true } });
    await vi.waitFor(() => expect(result.current.active).toBe(true));
    expect(result.current.supported).toBe(true);

    rerender({ enabled: false });
    await vi.waitFor(() => expect(sentinels[0].release).toHaveBeenCalled());

    rerender({ enabled: true });
    await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(2));
    unmount();
    await act(async () => { await Promise.resolve(); });
    expect(sentinels[1].release).toHaveBeenCalled();
  });

  it('degrades to inactive without the API', async () => {
    const { result } = renderHook(() => useWakeLock());
    await act(async () => { await Promise.resolve(); });
    expect(result.current).toMatchObject({ supported: false, active: false });
    await expect(result.current.request()).resolves.toBe(false);
  });
});
