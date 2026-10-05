import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { ConnectionStatus, PairingInfo } from '../core/types';

export interface HostHUDLabels {
  waiting: string;
  scanToJoin: string;
  enterCode: string;
  pin: string;
  peers: string;
  copyLink: string;
  copied: string;
  status: Record<ConnectionStatus, string>;
}

export const defaultHostHUDLabels: HostHUDLabels = {
  waiting: 'Creating room…',
  scanToJoin: 'Scan to join',
  enterCode: 'Or enter code',
  pin: 'PIN',
  peers: 'Connected',
  copyLink: 'Copy link',
  copied: 'Copied',
  status: {
    idle: 'Idle',
    connecting: 'Connecting…',
    connected: 'Online',
    reconnecting: 'Reconnecting…',
    disconnected: 'Offline',
    error: 'Connection error',
  },
};

export interface HostHUDProps {
  /** `null` while the room is still being created. */
  pairing: PairingInfo | null;
  /**
   * Renders the QR code for `value` (the join URL). snap-pair ships no QR
   * encoder; plug one in, e.g. with `qrcode.react`:
   * `renderQr={(value, size) => <QRCodeSVG value={value} size={size} />}`.
   * Without it the HUD falls back to the link and the room code.
   */
  renderQr?: (value: string, size: number) => ReactNode;
  /** Pixel size passed to `renderQr`. Default: 192. */
  qrSize?: number;
  /** Peers currently connected (including the host, if you count it). */
  peerCount?: number;
  maxPeers?: number;
  status?: ConnectionStatus;
  /** Override any UI string (e.g. for localization). */
  labels?: Partial<Omit<HostHUDLabels, 'status'>> & { status?: Partial<HostHUDLabels['status']> };
  className?: string;
  style?: CSSProperties;
  /** Extra content rendered at the bottom of the HUD (e.g. a start button). */
  children?: ReactNode;
}

/** Splits a code into groups of three for legibility: `ABC234` -> `ABC 234`. */
function groupCode(code: string): string {
  return code.replace(/(.{3})(?=.)/g, '$1 ');
}

const styles = {
  root: {
    display: 'inline-flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: 12,
    fontFamily: 'system-ui, sans-serif',
  },
  label: { fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 },
  code: { fontFamily: 'ui-monospace, monospace', fontSize: 32, fontWeight: 700, letterSpacing: '0.12em' },
  pin: { fontFamily: 'ui-monospace, monospace', fontSize: 24, letterSpacing: '0.12em' },
  link: { fontSize: 12, wordBreak: 'break-all', maxWidth: 260, textAlign: 'center' },
  meta: { display: 'flex', gap: 12, fontSize: 13 },
} satisfies Record<string, CSSProperties>;

/**
 * Host-side pairing panel: a QR code for the join URL with the room code (and
 * optional PIN) as a typed fallback, plus peer count and connection status.
 */
export function HostHUD({
  pairing,
  renderQr,
  qrSize = 192,
  peerCount,
  maxPeers,
  status,
  labels: labelOverrides,
  className,
  style,
  children,
}: HostHUDProps) {
  const labels: HostHUDLabels = {
    ...defaultHostHUDLabels,
    ...labelOverrides,
    status: { ...defaultHostHUDLabels.status, ...labelOverrides?.status },
  };
  const [copied, setCopied] = useState(false);
  const joinUrl = pairing?.joinUrl;

  useEffect(() => {
    setCopied(false);
  }, [joinUrl]);

  const canCopy = Boolean(joinUrl) && typeof navigator !== 'undefined' && Boolean(navigator.clipboard?.writeText);
  const copyLink = () => {
    if (!joinUrl) return;
    navigator.clipboard.writeText(joinUrl).then(() => setCopied(true), () => setCopied(false));
  };

  return (
    <section className={className} style={{ ...styles.root, ...style }} aria-label="Pairing" data-snap-pair-hud="">
      {!pairing ? (
        <p role="status">{labels.waiting}</p>
      ) : (
        <>
          {joinUrl && renderQr && (
            <figure style={{ margin: 0, textAlign: 'center' }} data-snap-pair-qr="">
              {renderQr(joinUrl, qrSize)}
              <figcaption style={styles.label}>{labels.scanToJoin}</figcaption>
            </figure>
          )}

          <div style={{ textAlign: 'center' }}>
            <div style={styles.label}>{labels.enterCode}</div>
            <span style={styles.code} aria-label={`${labels.enterCode}: ${pairing.code.split('').join(' ')}`}>
              {groupCode(pairing.code)}
            </span>
          </div>

          {pairing.pin && (
            <div style={{ textAlign: 'center' }}>
              <div style={styles.label}>{labels.pin}</div>
              <span style={styles.pin} aria-label={`${labels.pin}: ${pairing.pin.split('').join(' ')}`}>
                {groupCode(pairing.pin)}
              </span>
            </div>
          )}

          {joinUrl && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <a href={joinUrl} style={styles.link} target="_blank" rel="noreferrer">{joinUrl}</a>
              {canCopy && (
                <button type="button" onClick={copyLink}>{copied ? labels.copied : labels.copyLink}</button>
              )}
            </div>
          )}
        </>
      )}

      {(peerCount !== undefined || status) && (
        <div style={styles.meta}>
          {peerCount !== undefined && (
            <span data-snap-pair-peers="">
              {labels.peers}: {maxPeers !== undefined ? `${peerCount}/${maxPeers}` : peerCount}
            </span>
          )}
          {status && <span role="status" data-status={status}>{labels.status[status]}</span>}
        </div>
      )}

      {children}
    </section>
  );
}
