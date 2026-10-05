// @vitest-environment jsdom
import { cleanup, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HostHUD } from '../components/HostHUD';
import {
  buildPairingJoinUrl,
  createQrRenderer,
  loadQrLib,
  parseJoinUrl,
  toQrDataUrl,
  useQrRenderer,
  type QrCodeLib,
} from './qr';

const fakeLib = (): QrCodeLib & { toDataURL: ReturnType<typeof vi.fn> } => ({
  toDataURL: vi.fn(async (text: string) => `data:image/png;base64,${btoa(text)}`),
});

afterEach(() => {
  cleanup();
});

describe('join URLs', () => {
  it('puts a PIN-only room in ?pin= and a code room in ?room=', () => {
    expect(buildPairingJoinUrl('https://play.example.com/join', { code: '123456', pin: '123456' }))
      .toBe('https://play.example.com/join?pin=123456');
    expect(buildPairingJoinUrl('https://play.example.com/join', { code: 'ABC234' }))
      .toBe('https://play.example.com/join?room=ABC234');
  });

  it('never leaks a separate PIN into the URL', () => {
    expect(buildPairingJoinUrl('https://play.example.com/', { code: 'ABC234', pin: '987654' }))
      .toBe('https://play.example.com/?room=ABC234');
  });

  it('parses and normalizes codes and PINs from a URL', () => {
    expect(parseJoinUrl('https://x.test/?room=abc-234')).toEqual({ code: 'ABC234', pin: null });
    expect(parseJoinUrl('https://x.test/?pin=%EF%BC%91%EF%BC%92%EF%BC%93456')).toEqual({ code: null, pin: '123456' });
    expect(parseJoinUrl(new URL('https://x.test/?c=ABC234&p=12-34-56'), { codeParam: 'c', pinParam: 'p' }))
      .toEqual({ code: 'ABC234', pin: '123456' });
    expect(parseJoinUrl('https://x.test/?room=nope&pin=12')).toEqual({ code: null, pin: null });
    expect(parseJoinUrl('not a url')).toEqual({ code: null, pin: null });
  });
});

describe('QR encoding', () => {
  it('loads the optional qrcode module through an importer (default or named export)', async () => {
    const lib = fakeLib();
    expect(await loadQrLib(async () => ({ default: lib }))).toBe(lib);
    expect(await loadQrLib(async () => lib)).toBe(lib);
    expect(await loadQrLib(async () => { throw new Error('Cannot find module'); })).toBeNull();
    expect(await loadQrLib(async () => ({ default: {} }))).toBeNull();
  });

  it('returns null when qrcode is not installed', async () => {
    expect(await loadQrLib()).toBeNull();
    expect(await toQrDataUrl('https://x.test/')).toBeNull();
  });

  it('encodes with an injected library and passes size and options through', async () => {
    const lib = fakeLib();
    const url = await toQrDataUrl('https://x.test/?room=ABC234', { lib, size: 300, errorCorrectionLevel: 'H', color: { dark: '#111' } });
    expect(url).toMatch(/^data:image\/png;base64,/);
    expect(lib.toDataURL).toHaveBeenCalledWith('https://x.test/?room=ABC234', {
      width: 300, margin: 2, errorCorrectionLevel: 'H', color: { dark: '#111' },
    });
  });

  it('returns null for lib: null and when encoding fails', async () => {
    expect(await toQrDataUrl('x', { lib: null })).toBeNull();
    expect(await toQrDataUrl('x', { lib: { toDataURL: () => Promise.reject(new Error('too long')) } })).toBeNull();
  });
});

describe('HostHUD integration', () => {
  const pairing = { roomId: 'r', code: 'ABC234', joinUrl: 'https://play.example.com/join?room=ABC234' };

  it('createQrRenderer shows a placeholder, then the QR image', async () => {
    const lib = fakeLib();
    const { container } = render(<HostHUD pairing={pairing} renderQr={createQrRenderer(lib)} qrSize={128} />);
    expect(container.querySelector('[data-snap-pair-qr-loading]')).not.toBeNull();
    const img = await screen.findByAltText('QR code to join');
    expect(img.getAttribute('src')).toBe(`data:image/png;base64,${btoa(pairing.joinUrl)}`);
    expect(img.getAttribute('width')).toBe('128');
    expect(screen.getByText('Scan to join')).toBeTruthy();
  });

  it('renders no image when encoding fails, keeping code and link', async () => {
    const lib = { toDataURL: () => Promise.reject(new Error('too long')) };
    const { container } = render(<HostHUD pairing={pairing} renderQr={createQrRenderer(lib)} />);
    await waitFor(() => expect(container.querySelector('[data-snap-pair-qr-loading]')).toBeNull());
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('ABC 234')).toBeTruthy();
  });

  it('useQrRenderer stays undefined without qrcode, so the HUD shows no QR section', async () => {
    const { result } = renderHook(() => useQrRenderer());
    await waitFor(() => expect(result.current).toBeUndefined());
    const { container } = render(<HostHUD pairing={pairing} renderQr={result.current} />);
    expect(container.querySelector('[data-snap-pair-qr]')).toBeNull();
    expect(screen.queryByText('Scan to join')).toBeNull();
  });

  it('useQrRenderer is ready immediately with an injected lib and disabled with lib: null', async () => {
    const lib = fakeLib();
    const injected = renderHook(() => useQrRenderer({ lib, alt: 'Join' }));
    expect(injected.result.current).toBeTypeOf('function');
    render(<HostHUD pairing={pairing} renderQr={injected.result.current} />);
    expect(await screen.findByAltText('Join')).toBeTruthy();

    const disabled = renderHook(() => useQrRenderer({ lib: null }));
    expect(disabled.result.current).toBeUndefined();
  });

  it('a renderQr that returns null hides the figure', () => {
    const { container } = render(<HostHUD pairing={pairing} renderQr={() => null} />);
    expect(container.querySelector('[data-snap-pair-qr]')).toBeNull();
  });

  it('shows a PIN that is the room code only once', () => {
    render(<HostHUD pairing={{ roomId: 'r', code: '123456', pin: '123456' }} />);
    expect(screen.getAllByText('123 456')).toHaveLength(1);
    expect(screen.queryByText('PIN')).toBeNull();
  });
});
