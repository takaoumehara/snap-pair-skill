import QRCode from 'qrcode';
import { useState, type ReactNode } from 'react';
import {
  ControllerWrapper,
  HostHUD,
  useQrRenderer,
  type ControllerWrapperProps,
  type Locale,
  type Peer,
  type Transport,
} from 'snap-pair-core';
import { config, locale } from './snap';

/** Big-screen layout: the experience fills the screen, the pairing HUD floats in a corner. */
export function HostLayout({ pairing, peers, status, children }: {
  pairing: Parameters<typeof HostHUD>[0]['pairing'];
  peers: number;
  status: Parameters<typeof HostHUD>[0]['status'];
  children: ReactNode;
}) {
  // Inject the QR encoder so bundlers include it (see SKILL.md, "optional peers").
  const renderQr = useQrRenderer({ lib: QRCode });
  const [hudOpen, setHudOpen] = useState(true);
  return (
    <main className="host">
      {children}
      <aside className="hud">
        {hudOpen && (
          <HostHUD
            pairing={pairing}
            renderQr={renderQr}
            qrSize={160}
            peerCount={Math.max(0, peers - 1)}
            maxPeers={config.maxPlayers ? config.maxPlayers - 1 : undefined}
            status={status}
            locale={locale}
          />
        )}
        <button type="button" className="hud-toggle" onClick={() => setHudOpen((open) => !open)}>
          {hudOpen ? '×' : 'QR'}
        </button>
      </aside>
    </main>
  );
}

const ROOM_INPUT_LABEL: Record<Locale, string> = { en: 'Room code', ja: 'ルームコード' };
const JOIN_LABEL: Record<Locale, string> = { en: 'Join', ja: '参加' };

/** Phone-side shell: join form until admitted, then ControllerWrapper around the controls. */
export function ControllerShell({ transport, snap, code, join, rejoin, motion, orientation, children }: {
  transport: Transport<Peer, any>;
  snap: { room: unknown; error: string | null; loading: boolean };
  code: string | null;
  join: (code: string) => void;
  rejoin: () => void;
  motion?: boolean;
  orientation?: 'portrait' | 'landscape';
  children: ControllerWrapperProps['children'];
}) {
  const [draft, setDraft] = useState(code ?? '');
  if (!snap.room) {
    return (
      <main className="controller join">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            join(draft);
          }}
        >
          <label>
            {ROOM_INPUT_LABEL[locale]}
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              inputMode={config.pairing === 'pin' ? 'numeric' : 'text'}
              autoCapitalize="characters"
              autoComplete="off"
              maxLength={8}
            />
          </label>
          <button type="submit" disabled={snap.loading}>{JOIN_LABEL[locale]}</button>
          {snap.error && <p role="alert">{snap.error}</p>}
        </form>
      </main>
    );
  }
  return (
    <ControllerWrapper
      transport={transport}
      locale={locale}
      roomCode={transport.room?.code}
      onReconnect={rejoin}
      motion={motion}
      orientation={orientation}
      className="controller"
    >
      {children}
    </ControllerWrapper>
  );
}
