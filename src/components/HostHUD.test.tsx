// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostHUD } from './HostHUD';
import { buildJoinUrl } from '../core/utils';

const pairing = {
  roomId: 'room-1',
  code: 'ABC234',
  joinUrl: buildJoinUrl('https://play.example.com/join', 'ABC234'),
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HostHUD', () => {
  it('shows a waiting state before the room exists', () => {
    render(<HostHUD pairing={null} />);
    expect(screen.getByRole('status').textContent).toBe('Creating room…');
  });

  it('renders the QR through renderQr with the join URL and size', () => {
    const renderQr = vi.fn((value: string, size: number) => <img alt="qr" data-value={value} width={size} />);
    render(<HostHUD pairing={pairing} renderQr={renderQr} qrSize={128} />);
    expect(renderQr).toHaveBeenCalledWith('https://play.example.com/join?room=ABC234', 128);
    expect(screen.getByAltText('qr').getAttribute('data-value')).toBe(pairing.joinUrl);
    expect(screen.getByText('Scan to join')).toBeTruthy();
  });

  it('falls back to the room code and link when no QR renderer is supplied', () => {
    const { container } = render(<HostHUD pairing={pairing} />);
    expect(container.querySelector('[data-snap-pair-qr]')).toBeNull();
    expect(screen.getByLabelText('Or enter code: A B C 2 3 4').textContent).toBe('ABC 234');
    expect(screen.getByRole('link').getAttribute('href')).toBe(pairing.joinUrl);
  });

  it('omits the QR when there is no join URL, even with a renderer', () => {
    const renderQr = vi.fn(() => null);
    render(<HostHUD pairing={{ roomId: 'room-1', code: 'ABC234' }} renderQr={renderQr} />);
    expect(renderQr).not.toHaveBeenCalled();
    expect(screen.queryByRole('link')).toBeNull();
  });

  it('shows the PIN fallback when present', () => {
    render(<HostHUD pairing={{ ...pairing, pin: '123456' }} />);
    expect(screen.getByLabelText('PIN: 1 2 3 4 5 6').textContent).toBe('123 456');
  });

  it('shows peer count and connection status', () => {
    render(<HostHUD pairing={pairing} peerCount={3} maxPeers={8} status="reconnecting" />);
    expect(screen.getByText('Connected: 3/8')).toBeTruthy();
    expect(screen.getByRole('status').getAttribute('data-status')).toBe('reconnecting');
    expect(screen.getByRole('status').textContent).toBe('Reconnecting…');
  });

  it('accepts partial label overrides for localization', () => {
    render(
      <HostHUD
        pairing={pairing}
        status="connected"
        labels={{ enterCode: 'コードを入力', status: { connected: 'オンライン' } }}
      />,
    );
    expect(screen.getByText('コードを入力')).toBeTruthy();
    expect(screen.getByText('オンライン')).toBeTruthy();
    expect(screen.queryByText('Or enter code')).toBeNull();
    expect(screen.getByLabelText('コードを入力: A B C 2 3 4')).toBeTruthy();
  });

  it('copies the join URL when the clipboard API is available', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    render(<HostHUD pairing={pairing} />);
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Copy link' })); });
    expect(writeText).toHaveBeenCalledWith(pairing.joinUrl);
    expect(screen.getByRole('button').textContent).toBe('Copied');
  });

  it('hides the copy button without a clipboard API', () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    render(<HostHUD pairing={pairing} />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders children below the pairing info', () => {
    render(<HostHUD pairing={pairing}><button type="button">Start</button></HostHUD>);
    expect(screen.getByRole('button', { name: 'Start' })).toBeTruthy();
  });
});
