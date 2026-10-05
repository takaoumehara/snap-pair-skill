import PartySocket from 'partysocket';
import { useEffect, useRef, useState } from 'react';
import {
  BroadcastChannelTransport,
  buildPairingJoinUrl,
  parseJoinUrl,
  PartyKitTransport,
  useSnapPair,
  WebRTCTransport,
  type ConnectionStatus,
  type Locale,
  type PairingInfo,
  type Peer,
  type Room,
  type Transport,
  type TransportMessage,
} from 'snap-pair-core';
import rawConfig from '../snap-pair.config.json';

/** The parts of snap-pair.config.json this app reads (written by `snap-pair init`). */
interface AppConfig {
  preset: string | null;
  transport: 'broadcast' | 'partykit' | 'webrtc' | 'firebase';
  pairing: 'qr' | 'code' | 'pin' | 'broadcast';
  locale?: Locale;
  maxPlayers?: number;
  namespace?: string;
  partykit?: { host?: string; party?: string };
  webrtc?: { signaling: 'partykit' | 'broadcast'; iceServers?: RTCIceServer[] };
}

export const config = rawConfig as AppConfig;
export const locale: Locale = config.locale ?? 'en';

/** Where guests land: this page with `?room=CODE` (or `?pin=123456`). */
export const joinBaseUrl = () => `${location.origin}${location.pathname}`;

const partykitHost = () => config.partykit?.host || import.meta.env.VITE_PARTYKIT_HOST || `${location.hostname}:1999`;

/** Builds the transport chosen in snap-pair.config.json. */
export function createTransport<TState>(name: string): Transport<Peer, TState> {
  const relay = {
    name,
    maxPlayers: config.maxPlayers,
    pairing: config.pairing === 'pin' ? 'pin' as const : 'code' as const,
    joinBaseUrl: joinBaseUrl(),
    namespace: config.namespace ?? `snap-pair-${config.preset ?? 'app'}`,
    // Controllers only send messages; shared state is the host's alone.
    allowGuestState: false,
  };
  const partykit = () => new PartyKitTransport<Peer, TState>({
    ...relay,
    host: partykitHost(),
    party: config.partykit?.party,
    // Bundled apps should inject partysocket (it reconnects and buffers for us).
    socketFactory: (params) => new PartySocket(params),
  });

  switch (config.transport) {
    case 'broadcast':
      return new BroadcastChannelTransport<Peer, TState>(relay);
    case 'partykit':
      return partykit();
    case 'webrtc':
      return new WebRTCTransport<Peer, TState>({
        name,
        maxPlayers: config.maxPlayers,
        allowGuestState: false,
        iceServers: config.webrtc?.iceServers,
        signaling: config.webrtc?.signaling === 'broadcast' ? new BroadcastChannelTransport(relay) : partykit(),
      });
    default:
      throw new Error(
        `The ${config.transport} transport has no ephemeral messaging, so this preset cannot run on it. `
          + 'Run `npx snap-pair init` again and pick partykit, webrtc, or broadcast.',
      );
  }
}

/** Everything HostHUD needs, derived from the room (the code doubles as the PIN in PIN mode). */
export function pairingInfo(room: Room): PairingInfo {
  const pin = config.pairing === 'pin' ? room.code : undefined;
  return { roomId: room.id, code: room.code, pin, joinUrl: buildPairingJoinUrl(joinBaseUrl(), { code: room.code, pin }) };
}

/** Room code or PIN from `?room=` / `?pin=`, if any. */
export function codeFromUrl(): string | null {
  const { code, pin } = parseJoinUrl(location.href);
  return pin ?? code;
}

/** True on the guest side: the page was opened through a join link (or `?join`). */
export function isControllerUrl(): boolean {
  const params = new URLSearchParams(location.search);
  return params.has('room') || params.has('pin') || params.has('join');
}

/** One transport for the page's lifetime; the room is left when the page goes away. */
function usePageTransport<TState>(name: string): Transport<Peer, TState> {
  const [transport] = useState(() => createTransport<TState>(name));
  useEffect(() => {
    const bye = () => { void transport.leaveRoom(); };
    window.addEventListener('pagehide', bye);
    return () => window.removeEventListener('pagehide', bye);
  }, [transport]);
  return transport;
}

/** Host side: connects and creates the room once. */
export function useHostRoom<TState>(initialState: TState) {
  const transport = usePageTransport<TState>('Host');
  const snap = useSnapPair<Peer, TState>({ transport, guest: { id: '', name: 'Host' } });
  const started = useRef(false);
  useEffect(() => {
    if (!snap.authReady || snap.room || started.current) return;
    started.current = true;
    void snap.createRoom(initialState);
  }, [snap.authReady, snap.room, snap.createRoom, initialState]);
  return { transport, snap, pairing: snap.room ? pairingInfo(snap.room) : null };
}

const randomName = () => `Player ${Math.floor(100 + Math.random() * 900)}`;

/** Controller side: joins the room from the URL automatically, or via `join(code)`. */
export function useControllerRoom<TState>() {
  const [name] = useState(randomName);
  const transport = usePageTransport<TState>(name);
  const snap = useSnapPair<Peer, TState>({ transport, guest: { id: '', name } });
  const [code, setCode] = useState(codeFromUrl);
  const tried = useRef<string | null>(null);

  useEffect(() => {
    if (!snap.authReady || !code || snap.room || tried.current === code) return;
    tried.current = code;
    void snap.joinRoom(code);
  }, [snap.authReady, code, snap.room, snap.joinRoom]);

  /** Retries with the same code (ControllerWrapper's reconnect button). */
  const rejoin = () => {
    if (code) void snap.joinRoom(code);
  };

  return { transport, snap, name, code, join: setCode, rejoin };
}

/** The transport's connection status as React state. */
export function useTransportStatus(transport: Transport<Peer, any>): ConnectionStatus {
  const [status, setStatus] = useState<ConnectionStatus>(transport.status);
  useEffect(() => transport.onStatus(setStatus), [transport]);
  return status;
}

/** Number of peers in the room, host included. */
export const peerCount = (room: Room | null | undefined) => Object.keys(room?.players ?? {}).length;

/** Clamps untrusted numbers from the network. */
export const clamp = (value: unknown, min: number, max: number, fallback = min) =>
  (typeof value === 'number' && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback);

/** Subscribes to one message type for the component's lifetime. */
export function useMessages<TPayload>(
  transport: Transport<Peer, any>,
  type: string,
  handler: (payload: TPayload, message: TransportMessage) => void,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => transport.onMessage((message) => {
    if (message.type === type) handlerRef.current(message.payload as TPayload, message);
  }), [transport, type]);
}

/** Calls `fn` at most once per `ms`, always delivering the latest arguments (trailing call). */
export function throttle<TArgs extends unknown[]>(fn: (...args: TArgs) => void, ms: number): (...args: TArgs) => void {
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: TArgs | null = null;
  return (...args: TArgs) => {
    pending = args;
    const wait = last + ms - Date.now();
    if (wait <= 0) {
      last = Date.now();
      pending = null;
      fn(...args);
    } else if (!timer) {
      timer = setTimeout(() => {
        timer = null;
        last = Date.now();
        if (pending) fn(...pending);
        pending = null;
      }, wait);
    }
  };
}

/** Fire-and-forget broadcast to every peer; never throws into UI handlers. */
export function send<TPayload>(transport: Transport<Peer, any>, type: string, payload: TPayload): void {
  if (!transport.room) return;
  transport.broadcast(type, payload).catch((error: unknown) => console.warn('[snap-pair] send failed', error));
}

/**
 * Controller input addressed to the host only. Other phones never see it, and
 * a WebRTC host does not forward it, which keeps big rooms cheap.
 */
export function sendToHost<TPayload>(transport: Transport<Peer, any>, type: string, payload: TPayload): void {
  const hostId = transport.room?.hostId;
  if (!hostId) return;
  transport.send({ type, payload, to: hostId }).catch((error: unknown) => console.warn('[snap-pair] send failed', error));
}
