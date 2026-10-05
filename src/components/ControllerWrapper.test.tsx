// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionStatus } from '../core/types';
import { ControllerWrapper, getControllerLabels } from './ControllerWrapper';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // jsdom keeps these between tests.
  delete (document.documentElement as any).requestFullscreen;
  delete (document as any).exitFullscreen;
  Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
});

function fakeWakeLock() {
  const sentinels: Array<{ released: boolean; release: ReturnType<typeof vi.fn> }> = [];
  const request = vi.fn(async () => {
    const sentinel = { released: false, release: vi.fn(async () => { sentinel.released = true; }), addEventListener: vi.fn(), removeEventListener: vi.fn() };
    sentinels.push(sentinel);
    return sentinel;
  });
  vi.stubGlobal('navigator', { ...navigator, wakeLock: { request } });
  return { request, sentinels };
}

/** Minimal Transport-like status source. */
function statusSource(initial: ConnectionStatus) {
  const listeners = new Set<(s: ConnectionStatus) => void>();
  const source = {
    status: initial,
    onStatus(listener: (s: ConnectionStatus) => void) {
      listeners.add(listener);
      listener(source.status);
      return () => { listeners.delete(listener); };
    },
    set(next: ConnectionStatus) {
      source.status = next;
      for (const listener of listeners) listener(next);
    },
  };
  return source;
}

describe('ControllerWrapper', () => {
  it('renders children, the room code, and the status', () => {
    render(<ControllerWrapper status="connected" roomCode="ABC234" wakeLock={false}><button type="button">Fire</button></ControllerWrapper>);
    expect(screen.getByRole('button', { name: 'Fire' })).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('Online');
    expect(screen.getByText('ABC234')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Controller' }).getAttribute('data-status')).toBe('connected');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('follows a transport status and shows the reconnect banner while down', () => {
    const transport = statusSource('connected');
    const onReconnect = vi.fn();
    render(<ControllerWrapper transport={transport} onReconnect={onReconnect} wakeLock={false} />);
    expect(screen.queryByRole('alert')).toBeNull();

    act(() => transport.set('reconnecting'));
    expect(screen.getByRole('status').textContent).toBe('Reconnecting…');
    expect(screen.getByRole('alert').textContent).toContain('Connection lost');
    fireEvent.click(screen.getByRole('button', { name: 'Reconnect' }));
    expect(onReconnect).toHaveBeenCalledTimes(1);

    act(() => transport.set('connected'));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('shows the banner without a button when no onReconnect is given', () => {
    render(<ControllerWrapper status="error" wakeLock={false} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Reconnect' })).toBeNull();
  });

  it('requests a wake lock on mount and toggles it', async () => {
    const { request, sentinels } = fakeWakeLock();
    render(<ControllerWrapper status="connected" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Screen stays on' })).toBeTruthy());
    expect(request).toHaveBeenCalledWith('screen');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Screen stays on' })); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Keep screen on' }).getAttribute('aria-pressed')).toBe('false'));
    expect(sentinels[0].release).toHaveBeenCalled();

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Keep screen on' })); });
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  });

  it('hides the wake lock toggle where the API is missing', () => {
    vi.stubGlobal('navigator', { ...navigator, wakeLock: undefined });
    render(<ControllerWrapper status="connected" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('asks for iOS motion permission from a tap and reports the result', async () => {
    const requestPermission = vi.fn().mockResolvedValue('granted');
    vi.stubGlobal('DeviceOrientationEvent', Object.assign(function DeviceOrientationEvent() {}, { requestPermission }));
    vi.stubGlobal('DeviceMotionEvent', Object.assign(function DeviceMotionEvent() {}, { requestPermission }));
    const onMotionPermission = vi.fn();
    const children = vi.fn((ctx: { motionPermission: string }) => <span>motion: {ctx.motionPermission}</span>);
    render(<ControllerWrapper status="connected" wakeLock={false} motion onMotionPermission={onMotionPermission}>{children}</ControllerWrapper>);

    await waitFor(() => expect(screen.getByText('motion: prompt')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Enable motion sensors' }));
    // Both prompts start synchronously inside the click.
    expect(requestPermission).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(screen.getByText('motion: granted')).toBeTruthy());
    expect(onMotionPermission).toHaveBeenCalledWith('granted');
    expect(screen.queryByRole('button', { name: 'Enable motion sensors' })).toBeNull();
  });

  it('explains a denied motion permission', async () => {
    const requestPermission = vi.fn().mockResolvedValue('denied');
    vi.stubGlobal('DeviceOrientationEvent', Object.assign(function DeviceOrientationEvent() {}, { requestPermission }));
    render(<ControllerWrapper status="connected" wakeLock={false} motion />);
    fireEvent.click(await screen.findByRole('button', { name: 'Enable motion sensors' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/denied/);
  });

  it('grants motion immediately where no prompt is needed, and reports missing sensors', async () => {
    vi.stubGlobal('DeviceOrientationEvent', function DeviceOrientationEvent() {});
    const { unmount } = render(<ControllerWrapper status="connected" wakeLock={false} motion>{(ctx) => ctx.motionPermission}</ControllerWrapper>);
    await waitFor(() => expect(screen.getByText('granted')).toBeTruthy());
    unmount();

    vi.stubGlobal('DeviceOrientationEvent', undefined);
    render(<ControllerWrapper status="connected" wakeLock={false} motion />);
    expect(await screen.findByText('This device has no motion sensors.')).toBeTruthy();
  });

  it('enters fullscreen and locks the orientation', async () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('screen', { orientation: { type: 'portrait-primary', lock, unlock: vi.fn() } });
    (document.documentElement as any).requestFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: document.documentElement });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    (document as any).exitFullscreen = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, value: null });
      document.dispatchEvent(new Event('fullscreenchange'));
    });

    render(<ControllerWrapper status="connected" wakeLock={false} orientation="landscape" />);
    await act(async () => { fireEvent.click(await screen.findByRole('button', { name: 'Fullscreen' })); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Exit fullscreen' })).toBeTruthy());
    expect(lock).toHaveBeenCalledWith('landscape');

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' })); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Fullscreen' })).toBeTruthy());
  });

  it('hides the fullscreen button when unsupported', () => {
    render(<ControllerWrapper status="connected" wakeLock={false} orientation="portrait" />);
    expect(screen.queryByRole('button', { name: 'Fullscreen' })).toBeNull();
  });

  it('localizes and accepts label overrides', () => {
    render(<ControllerWrapper status="reconnecting" onReconnect={() => undefined} wakeLock={false} locale="ja" roomCode="123456" labels={{ room: 'PIN' }} />);
    expect(screen.getByRole('status').textContent).toBe('再接続中…');
    expect(screen.getByRole('button', { name: '再接続' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'コントローラー' })).toBeTruthy();
    expect(screen.getByText(/PIN:/)).toBeTruthy();
    expect(getControllerLabels('ja').status.error).toBe('接続エラー');
  });

  it('defaults to idle without a status', () => {
    render(<ControllerWrapper wakeLock={false} />);
    expect(screen.getByRole('status').textContent).toBe('Idle');
  });
});
