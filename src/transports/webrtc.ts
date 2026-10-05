import { TransportError, type Peer, type PeerRole, type TransportMessage, type Unsubscribe } from '../core/types';
import { createId } from '../core/utils';
import type { Transport } from './base';
import { DEFAULT_MAX_MESSAGE_BYTES, DEFAULT_MAX_REASSEMBLED_BYTES, Reassembler, splitMessage, utf8Length } from './chunking';
import { decodeWire, encodeWire } from './protocol';
import {
  RelayTransport,
  type RelayLink,
  type RelayLinkHandlers,
  type RelayRoomTarget,
  type RelayTransportOptions,
} from './relay';

/** `TransportMessage.type` used for offer/answer/ICE on the signaling transport. */
export const RTC_SIGNAL_TYPE = 'snap-pair:rtc';

/**
 * Signaling payload. Guests address the host as `'host'` until its answer
 * reveals its peer id. Every signaling member sees broadcasts, so each side
 * filters on `room` and `to`.
 */
export interface RtcSignal {
  kind: 'offer' | 'answer' | 'ice';
  room: string;
  from: string;
  to: string;
  sdp?: RTCSessionDescriptionInit;
  /** `null` marks end-of-candidates. */
  candidate?: RTCIceCandidateInit | null;
  /**
   * Identifies one guest RTCPeerConnection. Answers and candidates carry the
   * session of the offer they belong to, so stale ones from a replaced
   * connection are ignored. Optional for compatibility with Phase 2 peers.
   */
  session?: string;
  /** Offer is an ICE restart of the existing connection `session` (not a new one). */
  restart?: boolean;
}

type PeerConnectionConstructor = new (config?: RTCConfiguration) => RTCPeerConnection;

export interface WebRTCReconnectOptions {
  /** Re-offer attempts after a guest's channel drops (0 disables re-offers; ICE restart still runs). Default: 5. */
  maxAttempts?: number;
  /** Delay before the first re-offer; doubles per attempt. Default: 500 ms. */
  baseDelayMs?: number;
  /** Backoff cap. Default: 8000 ms. */
  maxDelayMs?: number;
  /** How long the host keeps a guest whose ICE failed, waiting for its ICE restart. Default: 5000 ms. */
  iceRestartGraceMs?: number;
}

export interface WebRTCTransportOptions extends Omit<RelayTransportOptions, 'pairing' | 'namespace' | 'joinBaseUrl' | 'claimWindowMs'> {
  /**
   * Carries offers, answers, and ICE candidates. Any transport with
   * `capabilities.messaging` works (PartyKit across the internet,
   * BroadcastChannel for tests). Room codes, PINs, and join URLs come from it.
   */
  signaling: Transport;
  /** Default: one public Google STUN server. Add TURN for restrictive networks. */
  iceServers?: RTCIceServer[];
  /** Inject an implementation (tests, `wrtc` on Node). Default: the global one. */
  RTCPeerConnection?: PeerConnectionConstructor;
  /** How long a guest waits for its DataChannel to open (per attempt). Default: 15000 ms. */
  connectTimeoutMs?: number;
  /** DataChannel label. Default: `'snap-pair'`. */
  channelLabel?: string;
  /**
   * Guest-side recovery: ICE restart when the connection fails, then a fresh
   * offer with exponential backoff when the channel closes. `false` restores
   * the Phase 2 behavior (stay `reconnecting` until `joinRoom` is called again).
   */
  reconnect?: boolean | WebRTCReconnectOptions;
  /** Frames larger than this (UTF-8 bytes) are split into chunks. Default: 16 KiB, portable across browsers. */
  maxMessageBytes?: number;
  /** Largest frame a receiver reassembles; bigger ones are dropped. Default: 1 MiB. */
  maxReassembledBytes?: number;
}

export const DEFAULT_ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];

/** True when a global `RTCPeerConnection` exists. Safe to call during SSR. */
export function isWebRTCSupported(): boolean {
  return typeof (globalThis as { RTCPeerConnection?: unknown }).RTCPeerConnection === 'function';
}

const plainDescription = (desc: RTCSessionDescriptionInit | null | undefined): RTCSessionDescriptionInit | undefined =>
  desc ? { type: desc.type, sdp: desc.sdp } : undefined;

const plainCandidate = (candidate: RTCIceCandidate | null): RTCIceCandidateInit | null => {
  if (!candidate) return null;
  if (typeof candidate.toJSON === 'function') return candidate.toJSON();
  const { candidate: line, sdpMid, sdpMLineIndex, usernameFragment } = candidate;
  return { candidate: line, sdpMid, sdpMLineIndex, usernameFragment };
};

const errorText = (error: unknown) => (error as Error)?.message ?? String(error);

function parseSignal(message: TransportMessage): RtcSignal | null {
  if (message.type !== RTC_SIGNAL_TYPE) return null;
  const signal = message.payload as RtcSignal | null;
  if (!signal || typeof signal !== 'object' || typeof signal.room !== 'string' || typeof signal.from !== 'string' || typeof signal.to !== 'string') return null;
  if (signal.kind !== 'offer' && signal.kind !== 'answer' && signal.kind !== 'ice') return null;
  if (signal.session !== undefined && typeof signal.session !== 'string') return null;
  return signal;
}

interface ResolvedReconnect {
  enabled: boolean;
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
  iceRestartGraceMs: number;
}

function resolveReconnect(option: WebRTCTransportOptions['reconnect']): ResolvedReconnect {
  const settings = typeof option === 'object' ? option : {};
  return {
    enabled: option !== false,
    maxAttempts: settings.maxAttempts ?? 5,
    baseDelayMs: settings.baseDelayMs ?? 500,
    maxDelayMs: settings.maxDelayMs ?? 8000,
    iceRestartGraceMs: settings.iceRestartGraceMs ?? 5000,
  };
}

interface HostPeerEntry {
  session?: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  pendingCandidates: RTCIceCandidateInit[];
  remoteSet: boolean;
  reassembler: Reassembler;
  /** Pending drop after ICE failed, cancelled if the guest's ICE restart succeeds. */
  graceTimer: ReturnType<typeof setTimeout> | null;
}

interface GuestConnection {
  session: string;
  pc: RTCPeerConnection;
  channel: RTCDataChannel;
  pendingCandidates: RTCIceCandidateInit[];
  remoteSet: boolean;
  /** An ICE-restart offer is waiting for its answer. */
  restarting: boolean;
  reassembler: Reassembler;
}

/**
 * Peer-to-peer transport over `RTCDataChannel`s in a star: every guest has one
 * ordered DataChannel to the host, and the host forwards guest messages to
 * the other guests. Signaling (offer/answer/ICE) rides on another transport's
 * messaging; after the channels open, room traffic (the same wire protocol as
 * BroadcastChannel and PartyKit) never touches the signaling server.
 *
 * Implemented: offer/answer/trickle-ICE exchange, candidate queueing until the
 * remote description is set, star routing, configurable `iceServers`, peer
 * removal when a channel closes, **automatic recovery** (ICE restart on
 * `failed`, then fresh offers with exponential backoff after the channel
 * drops; the relay engine re-announces the guest so the host re-admits it),
 * and **chunking** of frames over `maxMessageBytes` (16 KiB) with bounded
 * reassembly.
 *
 * Not yet: renegotiation (adding channels/tracks), binary payloads, mesh
 * topologies, and real-browser e2e tests (see docs/plan-phase3.md).
 */
export class WebRTCTransport<TPeer extends Peer = Peer, TState = any> extends RelayTransport<TPeer, TState> {
  readonly kind = 'webrtc' as const;
  protected readonly hostForwards = true;

  readonly signaling: Transport;
  private readonly rtcOptions: WebRTCTransportOptions;
  private readonly recovery: ResolvedReconnect;
  private inSignalingRoom = false;

  constructor(options: WebRTCTransportOptions) {
    // The signaling transport allocates rooms, so there is nothing to claim.
    super(options, { claimWindowMs: 0 });
    this.signaling = options.signaling;
    this.rtcOptions = options;
    this.recovery = resolveReconnect(options.reconnect);
  }

  private get PeerConnection(): PeerConnectionConstructor | undefined {
    return this.rtcOptions.RTCPeerConnection
      ?? (globalThis as { RTCPeerConnection?: PeerConnectionConstructor }).RTCPeerConnection;
  }

  private get rtcConfig(): RTCConfiguration {
    return { iceServers: this.rtcOptions.iceServers ?? DEFAULT_ICE_SERVERS };
  }

  private newReassembler(): Reassembler {
    return new Reassembler({ maxBytes: this.rtcOptions.maxReassembledBytes ?? DEFAULT_MAX_REASSEMBLED_BYTES });
  }

  /** Sends one frame, chunked when it exceeds the channel's (or the configured) message size. */
  private sendData(channel: RTCDataChannel, pc: RTCPeerConnection, data: string): void {
    const negotiated = (pc as RTCPeerConnection & { sctp?: { maxMessageSize?: number } | null }).sctp?.maxMessageSize;
    const limit = Math.min(this.rtcOptions.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES, negotiated && negotiated > 0 ? negotiated : Infinity);
    const maxTotal = this.rtcOptions.maxReassembledBytes ?? DEFAULT_MAX_REASSEMBLED_BYTES;
    if (data.length > maxTotal) {
      throw new TransportError('invalid', `Message is ${utf8Length(data)} bytes; the WebRTC transport carries at most ${maxTotal}.`);
    }
    for (const piece of splitMessage(data, limit, createId().slice(0, 12))) channel.send(piece);
  }

  protected async prepare(): Promise<void> {
    if (typeof this.PeerConnection !== 'function') {
      throw new TransportError('unsupported', 'RTCPeerConnection is not available here; pass `RTCPeerConnection` in the options.');
    }
    if (!this.signaling.capabilities.messaging) {
      throw new TransportError('unsupported', `The ${this.signaling.kind} transport cannot carry WebRTC signaling (no messaging).`);
    }
    if (this.signaling.status !== 'connected' && this.signaling.status !== 'reconnecting') {
      await this.signaling.connect();
    }
  }

  protected async allocateHostRoom(): Promise<RelayRoomTarget> {
    const { room, pairing } = await this.signaling.createRoom({ initialState: null, name: this.relayOptions.name });
    this.inSignalingRoom = true;
    return { roomKey: room.id, code: pairing.code, pin: pairing.pin, joinUrl: pairing.joinUrl, expiresAt: pairing.expiresAt };
  }

  protected async resolveGuestRoom(code: string): Promise<RelayRoomTarget> {
    const room = await this.signaling.joinRoom(code, { name: this.relayOptions.name });
    this.inSignalingRoom = true;
    return { roomKey: room.id, code: room.code };
  }

  protected async releaseRoom(): Promise<void> {
    if (!this.inSignalingRoom) return;
    this.inSignalingRoom = false;
    await this.signaling.leaveRoom();
  }

  protected openLink(roomKey: string, role: PeerRole, handlers: RelayLinkHandlers): Promise<RelayLink> {
    return role === 'host' ? Promise.resolve(this.openHostHub(roomKey, handlers)) : this.openGuestLink(roomKey, handlers);
  }

  private sendSignal(signal: Omit<RtcSignal, 'from'>): void {
    this.signaling.broadcast(RTC_SIGNAL_TYPE, { ...signal, from: this.peerId }).catch((error) => {
      this.emitError(new TransportError('backend', `WebRTC signaling failed: ${errorText(error)}`));
    });
  }

  private onSignal(roomKey: string, handle: (signal: RtcSignal) => void): Unsubscribe {
    return this.signaling.onMessage((message) => {
      const signal = parseSignal(message);
      if (signal && signal.room === roomKey && signal.from !== this.peerId) handle(signal);
    });
  }

  // ---- Host: one RTCPeerConnection per guest -------------------------------

  private openHostHub(roomKey: string, handlers: RelayLinkHandlers): RelayLink {
    const PeerConnection = this.PeerConnection!;
    const peers = new Map<string, HostPeerEntry>();
    // Candidates that overtook their offer (possible on relays that don't preserve order), per guest + session.
    const early = new Map<string, RTCIceCandidateInit[]>();
    const earlyKey = (from: string, session?: string) => `${from}|${session ?? ''}`;
    let closed = false;

    const drop = (peerId: string, notify: boolean) => {
      const entry = peers.get(peerId);
      if (!entry) return;
      peers.delete(peerId);
      if (entry.graceTimer) clearTimeout(entry.graceTimer);
      entry.reassembler.clear();
      entry.channel?.close();
      entry.pc.close();
      if (notify && !closed) handlers.onPeerGone(peerId);
    };

    const answer = async (entry: HostPeerEntry, signal: RtcSignal) => {
      const { pc } = entry;
      try {
        await pc.setRemoteDescription(signal.sdp!);
        entry.remoteSet = true;
        for (const candidate of entry.pendingCandidates.splice(0)) await pc.addIceCandidate(candidate);
        const description = await pc.createAnswer();
        await pc.setLocalDescription(description);
        if (peers.get(signal.from) !== entry) return;
        this.sendSignal({
          kind: 'answer', room: roomKey, to: signal.from, session: entry.session,
          sdp: plainDescription(pc.localDescription ?? description),
        });
      } catch (error) {
        // A failed restart ends a guest that was in the room; a failed first answer never admitted anyone.
        if (peers.get(signal.from) === entry) drop(signal.from, Boolean(signal.restart));
        this.emitError(new TransportError('backend', `WebRTC answer failed: ${errorText(error)}`));
      }
    };

    const acceptOffer = (signal: RtcSignal) => {
      const existing = peers.get(signal.from);
      if (signal.restart && existing && existing.session === signal.session) {
        // ICE restart: renegotiate the same connection; the data channel survives.
        if (existing.graceTimer) clearTimeout(existing.graceTimer);
        existing.graceTimer = null;
        void answer(existing, signal);
        return;
      }

      drop(signal.from, false); // A fresh offer replaces any previous connection from that guest.
      const pc = new PeerConnection(this.rtcConfig);
      const key = earlyKey(signal.from, signal.session);
      const entry: HostPeerEntry = {
        session: signal.session,
        pc,
        channel: null,
        pendingCandidates: early.get(key) ?? [],
        remoteSet: false,
        reassembler: this.newReassembler(),
        graceTimer: null,
      };
      early.delete(key);
      peers.set(signal.from, entry);

      pc.onicecandidate = (event) => {
        if (peers.get(signal.from) !== entry) return;
        this.sendSignal({ kind: 'ice', room: roomKey, to: signal.from, session: entry.session, candidate: plainCandidate(event.candidate) });
      };
      pc.onconnectionstatechange = () => {
        if (peers.get(signal.from) !== entry) return;
        const state = pc.connectionState;
        if (state === 'connected') {
          if (entry.graceTimer) clearTimeout(entry.graceTimer);
          entry.graceTimer = null;
        } else if (state === 'closed' || (state === 'failed' && !this.recovery.enabled)) {
          drop(signal.from, true);
        } else if ((state === 'failed' || state === 'disconnected') && !entry.graceTimer) {
          // Give the guest time to restart ICE before removing it from the room.
          entry.graceTimer = setTimeout(() => {
            entry.graceTimer = null;
            if (peers.get(signal.from) === entry && pc.connectionState !== 'connected') drop(signal.from, true);
          }, this.recovery.iceRestartGraceMs);
        }
      };
      pc.ondatachannel = (event) => {
        const channel = event.channel;
        entry.channel = channel;
        channel.onmessage = (message) => {
          const data = entry.reassembler.accept(message.data);
          // Pin frames to the channel they arrived on so guests cannot speak for each other.
          if (data !== null && decodeWire(data)?.from === signal.from) handlers.onFrame(data);
        };
        channel.onclose = () => {
          if (peers.get(signal.from) === entry) drop(signal.from, true);
        };
      };

      void answer(entry, signal);
    };

    const stopSignals = this.onSignal(roomKey, (signal) => {
      if (closed) return;
      if (signal.kind === 'offer' && signal.to === 'host' && signal.sdp) {
        acceptOffer(signal);
      } else if (signal.kind === 'offer' && signal.to === this.peerId && signal.sdp) {
        acceptOffer(signal); // Reconnecting guests already know our id.
      } else if (signal.kind === 'ice' && (signal.to === this.peerId || signal.to === 'host')) {
        // Guests address early candidates to 'host' because they don't know our id until the answer.
        if (!signal.candidate) return;
        const entry = peers.get(signal.from);
        if (!entry || (signal.session !== undefined && entry.session !== signal.session)) {
          const key = earlyKey(signal.from, signal.session);
          const queued = early.get(key) ?? [];
          if (queued.length < 64) queued.push(signal.candidate);
          early.set(key, queued);
          if (early.size > 256) early.delete(early.keys().next().value as string);
        } else if (entry.remoteSet) {
          entry.pc.addIceCandidate(signal.candidate).catch((error) => this.emitError(error as Error));
        } else {
          entry.pendingCandidates.push(signal.candidate);
        }
      }
    });

    return {
      send: (frame) => {
        const data = encodeWire(frame);
        const targets = frame.to ? [peers.get(frame.to)] : [...peers].filter(([id]) => id !== frame.from).map(([, entry]) => entry);
        for (const entry of targets) {
          if (entry?.channel?.readyState === 'open') this.sendData(entry.channel, entry.pc, data);
        }
      },
      close: () => {
        closed = true;
        stopSignals();
        early.clear();
        for (const peerId of [...peers.keys()]) drop(peerId, false);
      },
    };
  }

  // ---- Guest: one RTCPeerConnection to the host, replaced on recovery -------

  private openGuestLink(roomKey: string, handlers: RelayLinkHandlers): Promise<RelayLink> {
    const PeerConnection = this.PeerConnection!;
    const recovery = this.recovery;
    const connectTimeoutMs = this.rtcOptions.connectTimeoutMs ?? 15000;
    let hostId: string | null = null;
    let current: GuestConnection | null = null;
    let closed = false;
    let established = false;
    let attempts = 0;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let attemptTimer: ReturnType<typeof setTimeout> | null = null;

    const dispose = (conn: GuestConnection | null) => {
      if (!conn) return;
      conn.reassembler.clear();
      conn.channel.onclose = null;
      conn.channel.close();
      conn.pc.close();
    };

    const offer = (conn: GuestConnection, restart: boolean) => {
      conn.pc.createOffer(restart ? { iceRestart: true } : undefined)
        .then(async (description) => {
          await conn.pc.setLocalDescription(description);
          if (current !== conn || closed) return;
          this.sendSignal({
            kind: 'offer', room: roomKey, to: hostId ?? 'host', session: conn.session, restart: restart || undefined,
            sdp: plainDescription(conn.pc.localDescription ?? description),
          });
        })
        .catch((error) => {
          if (current !== conn || closed) return;
          if (!established) fail(new TransportError('backend', `WebRTC offer failed: ${errorText(error)}`));
          else lose(conn);
        });
    };

    /** Creates a connection and sends its offer; `onOpen` runs when its channel opens. */
    const connect = (onOpen: () => void): GuestConnection => {
      const pc = new PeerConnection(this.rtcConfig);
      const channel = pc.createDataChannel(this.rtcOptions.channelLabel ?? 'snap-pair', { ordered: true });
      const conn: GuestConnection = {
        session: createId().slice(0, 12), pc, channel, pendingCandidates: [], remoteSet: false, restarting: false, reassembler: this.newReassembler(),
      };
      current = conn;
      pc.onicecandidate = (event) => {
        if (current !== conn || closed) return;
        this.sendSignal({ kind: 'ice', room: roomKey, to: hostId ?? 'host', session: conn.session, candidate: plainCandidate(event.candidate) });
      };
      pc.onconnectionstatechange = () => {
        if (current !== conn || closed) return;
        if (pc.connectionState === 'connected') {
          conn.restarting = false;
        } else if (pc.connectionState === 'failed' && established && recovery.enabled) {
          restartIce(conn);
        }
      };
      channel.onmessage = (message) => {
        if (current !== conn) return;
        const data = conn.reassembler.accept(message.data);
        if (data !== null) handlers.onFrame(data);
      };
      channel.onopen = () => { if (current === conn && !closed) onOpen(); };
      channel.onclose = () => {
        if (current !== conn || closed) return;
        if (established) lose(conn);
        else if (attempts === 0) fail(new TransportError('backend', 'The WebRTC data channel to the host closed before it opened.'));
      };
      offer(conn, false);
      return conn;
    };

    /** ICE failed but the channel may survive: renegotiate the same connection with new ICE credentials. */
    const restartIce = (conn: GuestConnection) => {
      if (conn.restarting) return;
      conn.restarting = true;
      (conn.pc as RTCPeerConnection & { restartIce?: () => void }).restartIce?.();
      offer(conn, true);
      clearTimeout(attemptTimer!);
      attemptTimer = setTimeout(() => {
        if (current === conn && conn.restarting && conn.pc.connectionState !== 'connected') lose(conn);
      }, connectTimeoutMs);
    };

    /** The connection is gone: report it and schedule a fresh offer with backoff. */
    const lose = (conn: GuestConnection) => {
      if (current !== conn || closed) return;
      current = null;
      dispose(conn);
      handlers.onClose();
      scheduleReconnect();
    };

    const scheduleReconnect = () => {
      if (closed || !recovery.enabled || retryTimer) return;
      if (attempts >= recovery.maxAttempts) {
        this.emitError(new TransportError(
          'backend',
          `WebRTC reconnect failed after ${attempts} attempt${attempts === 1 ? '' : 's'}; call joinRoom() again.`,
        ));
        return;
      }
      const delay = Math.min(recovery.maxDelayMs, recovery.baseDelayMs * 2 ** attempts);
      attempts += 1;
      retryTimer = setTimeout(() => {
        retryTimer = null;
        if (closed) return;
        const conn = connect(() => {
          clearTimeout(attemptTimer!);
          attempts = 0;
          handlers.onOpen(); // The relay engine re-announces us; the host re-admits.
        });
        clearTimeout(attemptTimer!);
        attemptTimer = setTimeout(() => {
          if (current === conn && conn.channel.readyState !== 'open') {
            current = null;
            dispose(conn);
            scheduleReconnect();
          }
        }, connectTimeoutMs);
      }, delay);
    };

    const stopSignals = this.onSignal(roomKey, (signal) => {
      const conn = current;
      if (closed || !conn || signal.to !== this.peerId || (hostId && signal.from !== hostId)) return;
      // Answers and candidates for a replaced connection are stale (session-less ones come from Phase 2 hosts).
      if (signal.session !== undefined && signal.session !== conn.session) return;
      if (signal.kind === 'answer' && signal.sdp && (!conn.remoteSet || conn.restarting)) {
        hostId = signal.from;
        conn.pc.setRemoteDescription(signal.sdp)
          .then(async () => {
            conn.remoteSet = true;
            for (const candidate of conn.pendingCandidates.splice(0)) await conn.pc.addIceCandidate(candidate);
          })
          .catch((error) => this.emitError(new TransportError('backend', `WebRTC answer rejected: ${errorText(error)}`)));
      } else if (signal.kind === 'ice' && signal.candidate) {
        if (conn.remoteSet) conn.pc.addIceCandidate(signal.candidate).catch((error) => this.emitError(error as Error));
        else conn.pendingCandidates.push(signal.candidate);
      }
    });

    const link: RelayLink = {
      send: (frame) => {
        const conn = current;
        if (conn?.channel.readyState === 'open') this.sendData(conn.channel, conn.pc, encodeWire(frame));
      },
      close: () => {
        if (closed) return;
        closed = true;
        if (retryTimer) clearTimeout(retryTimer);
        clearTimeout(attemptTimer!);
        stopSignals();
        const conn = current;
        current = null;
        dispose(conn);
      },
    };

    let fail: (error: Error) => void = () => undefined;
    return new Promise<RelayLink>((resolve, reject) => {
      fail = (error: Error) => {
        clearTimeout(attemptTimer!);
        link.close();
        reject(error);
      };
      attemptTimer = setTimeout(
        () => fail(new TransportError('backend', 'Timed out opening the WebRTC data channel to the host.')),
        connectTimeoutMs,
      );
      connect(() => {
        clearTimeout(attemptTimer!);
        established = true;
        resolve(link);
      });
    });
  }
}
