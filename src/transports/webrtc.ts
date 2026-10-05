import { TransportError, type Peer, type PeerRole, type TransportMessage, type Unsubscribe } from '../core/types';
import type { Transport } from './base';
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
}

type PeerConnectionConstructor = new (config?: RTCConfiguration) => RTCPeerConnection;

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
  /** How long a guest waits for its DataChannel to open. Default: 15000 ms. */
  connectTimeoutMs?: number;
  /** DataChannel label. Default: `'snap-pair'`. */
  channelLabel?: string;
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

function parseSignal(message: TransportMessage): RtcSignal | null {
  if (message.type !== RTC_SIGNAL_TYPE) return null;
  const signal = message.payload as RtcSignal | null;
  if (!signal || typeof signal !== 'object' || typeof signal.room !== 'string' || typeof signal.from !== 'string' || typeof signal.to !== 'string') return null;
  if (signal.kind !== 'offer' && signal.kind !== 'answer' && signal.kind !== 'ice') return null;
  return signal;
}

interface HostPeerEntry {
  pc: RTCPeerConnection;
  channel: RTCDataChannel | null;
  pendingCandidates: RTCIceCandidateInit[];
  remoteSet: boolean;
}

/**
 * Peer-to-peer transport over `RTCDataChannel`s in a star: every guest has one
 * ordered DataChannel to the host, and the host forwards guest messages to
 * the other guests. Signaling (offer/answer/ICE) rides on another transport's
 * messaging; after the channels open, room traffic (the same wire protocol as
 * BroadcastChannel and PartyKit) never touches the signaling server.
 *
 * Implemented: offer/answer/trickle-ICE exchange, candidate queueing until the
 * remote description is set, star routing, configurable `iceServers`, and peer
 * removal when a channel or connection closes or fails.
 *
 * Not yet (TODO(phase3)): ICE restarts and automatic re-offer after a guest's
 * channel drops (the guest currently goes to `reconnecting` and must call
 * `joinRoom` again), renegotiation, binary payloads, chunking of messages over
 * the SCTP size limit (~16 KiB is safe everywhere), and mesh topologies.
 */
export class WebRTCTransport<TPeer extends Peer = Peer, TState = any> extends RelayTransport<TPeer, TState> {
  readonly kind = 'webrtc' as const;
  protected readonly hostForwards = true;

  readonly signaling: Transport;
  private readonly rtcOptions: WebRTCTransportOptions;
  private inSignalingRoom = false;

  constructor(options: WebRTCTransportOptions) {
    // The signaling transport allocates rooms, so there is nothing to claim.
    super(options, { claimWindowMs: 0 });
    this.signaling = options.signaling;
    this.rtcOptions = options;
  }

  private get PeerConnection(): PeerConnectionConstructor | undefined {
    return this.rtcOptions.RTCPeerConnection
      ?? (globalThis as { RTCPeerConnection?: PeerConnectionConstructor }).RTCPeerConnection;
  }

  private get rtcConfig(): RTCConfiguration {
    return { iceServers: this.rtcOptions.iceServers ?? DEFAULT_ICE_SERVERS };
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
      this.emitError(new TransportError('backend', `WebRTC signaling failed: ${(error as Error)?.message ?? error}`));
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
    // Candidates that overtook their offer (possible on relays that don't preserve order).
    const early = new Map<string, RTCIceCandidateInit[]>();
    let closed = false;

    const drop = (peerId: string, notify: boolean) => {
      const entry = peers.get(peerId);
      if (!entry) return;
      peers.delete(peerId);
      entry.channel?.close();
      entry.pc.close();
      if (notify && !closed) handlers.onPeerGone(peerId);
    };

    const acceptOffer = async (signal: RtcSignal) => {
      drop(signal.from, false); // A fresh offer replaces any previous connection from that guest.
      const pc = new PeerConnection(this.rtcConfig);
      const entry: HostPeerEntry = { pc, channel: null, pendingCandidates: early.get(signal.from) ?? [], remoteSet: false };
      early.delete(signal.from);
      peers.set(signal.from, entry);

      pc.onicecandidate = (event) => {
        this.sendSignal({ kind: 'ice', room: roomKey, to: signal.from, candidate: plainCandidate(event.candidate) });
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          if (peers.get(signal.from) === entry) drop(signal.from, true);
        }
      };
      pc.ondatachannel = (event) => {
        const channel = event.channel;
        entry.channel = channel;
        channel.onmessage = (message) => {
          // Pin frames to the channel they arrived on so guests cannot speak for each other.
          if (decodeWire(message.data)?.from === signal.from) handlers.onFrame(message.data);
        };
        channel.onclose = () => {
          if (peers.get(signal.from) === entry) drop(signal.from, true);
        };
      };

      try {
        await pc.setRemoteDescription(signal.sdp!);
        entry.remoteSet = true;
        for (const candidate of entry.pendingCandidates.splice(0)) await pc.addIceCandidate(candidate);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        if (peers.get(signal.from) !== entry) return;
        this.sendSignal({ kind: 'answer', room: roomKey, to: signal.from, sdp: plainDescription(pc.localDescription ?? answer) });
      } catch (error) {
        drop(signal.from, false);
        this.emitError(new TransportError('backend', `WebRTC answer failed: ${(error as Error)?.message ?? error}`));
      }
    };

    const stopSignals = this.onSignal(roomKey, (signal) => {
      if (closed) return;
      if (signal.kind === 'offer' && signal.to === 'host' && signal.sdp) {
        void acceptOffer(signal);
      } else if (signal.kind === 'ice' && (signal.to === this.peerId || signal.to === 'host')) {
        // Guests address early candidates to 'host' because they don't know our id until the answer.
        if (!signal.candidate) return;
        const entry = peers.get(signal.from);
        if (!entry) {
          const queued = early.get(signal.from) ?? [];
          if (queued.length < 64) queued.push(signal.candidate);
          early.set(signal.from, queued);
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
          if (entry?.channel?.readyState === 'open') entry.channel.send(data);
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

  // ---- Guest: one RTCPeerConnection to the host -----------------------------

  private openGuestLink(roomKey: string, handlers: RelayLinkHandlers): Promise<RelayLink> {
    const PeerConnection = this.PeerConnection!;
    const pc = new PeerConnection(this.rtcConfig);
    const channel = pc.createDataChannel(this.rtcOptions.channelLabel ?? 'snap-pair', { ordered: true });
    const pendingCandidates: RTCIceCandidateInit[] = [];
    let hostId: string | null = null;
    let remoteSet = false;
    let closed = false;

    const link: RelayLink = {
      send: (frame) => {
        if (channel.readyState === 'open') channel.send(encodeWire(frame));
      },
      close: () => {
        if (closed) return;
        closed = true;
        stopSignals();
        channel.close();
        pc.close();
      },
    };

    const stopSignals = this.onSignal(roomKey, (signal) => {
      if (closed || signal.to !== this.peerId || (hostId && signal.from !== hostId)) return;
      if (signal.kind === 'answer' && signal.sdp && !remoteSet) {
        hostId = signal.from;
        pc.setRemoteDescription(signal.sdp)
          .then(async () => {
            remoteSet = true;
            for (const candidate of pendingCandidates.splice(0)) await pc.addIceCandidate(candidate);
          })
          .catch((error) => this.emitError(new TransportError('backend', `WebRTC answer rejected: ${(error as Error)?.message ?? error}`)));
      } else if (signal.kind === 'ice' && signal.candidate) {
        if (remoteSet) pc.addIceCandidate(signal.candidate).catch((error) => this.emitError(error as Error));
        else pendingCandidates.push(signal.candidate);
      }
    });

    pc.onicecandidate = (event) => {
      this.sendSignal({ kind: 'ice', room: roomKey, to: hostId ?? 'host', candidate: plainCandidate(event.candidate) });
    };
    channel.onmessage = (message) => handlers.onFrame(message.data);

    return new Promise<RelayLink>((resolve, reject) => {
      const fail = (error: Error) => {
        clearTimeout(timer);
        link.close();
        reject(error);
      };
      const timer = setTimeout(
        () => fail(new TransportError('backend', 'Timed out opening the WebRTC data channel to the host.')),
        this.rtcOptions.connectTimeoutMs ?? 15000,
      );
      channel.onopen = () => {
        clearTimeout(timer);
        resolve(link);
      };
      // TODO(phase3): re-offer with an ICE restart instead of staying in `reconnecting`.
      channel.onclose = () => { if (!closed) handlers.onClose(); };

      pc.createOffer()
        .then(async (offer) => {
          await pc.setLocalDescription(offer);
          this.sendSignal({ kind: 'offer', room: roomKey, to: 'host', sdp: plainDescription(pc.localDescription ?? offer) });
        })
        .catch((error) => fail(new TransportError('backend', `WebRTC offer failed: ${(error as Error)?.message ?? error}`)));
    });
  }
}
