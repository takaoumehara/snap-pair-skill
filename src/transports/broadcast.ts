import { TransportError, type PeerRole, type Peer } from '../core/types';
import { RelayTransport, type RelayLink, type RelayLinkHandlers, type RelayTransportOptions } from './relay';

type BroadcastChannelConstructor = new (name: string) => BroadcastChannel;

export interface BroadcastChannelTransportOptions extends RelayTransportOptions {
  /** Channel names are `<prefix>:<roomKey>`. Default: `'snap-pair'`. */
  channelPrefix?: string;
  /** Inject a BroadcastChannel implementation (tests, polyfills). Default: the global one. */
  BroadcastChannel?: BroadcastChannelConstructor;
}

/** True when a global `BroadcastChannel` exists. Safe to call during SSR. */
export function isBroadcastChannelSupported(): boolean {
  return typeof (globalThis as { BroadcastChannel?: unknown }).BroadcastChannel === 'function';
}

/**
 * Same-origin, same-browser transport over `BroadcastChannel`: tabs, windows,
 * iframes, and workers on one machine, with no network at all. Built for the
 * Local Multi-Display preset (one tab per screen) and for offline demos.
 *
 * Every tab in a room shares one channel (`<channelPrefix>:<roomKey>`, where
 * the key is derived from the room code or PIN). The tab that created the room
 * is the host and owns the roster and state; see `./protocol.ts`.
 *
 * ```ts
 * const host = new BroadcastChannelTransport({ pairing: 'pin' });
 * await host.connect();
 * const { pairing } = await host.createRoom({ initialState: { scene: 0 } });
 * // in another tab:
 * const screen2 = new BroadcastChannelTransport({ pairing: 'pin' });
 * await screen2.connect();
 * await screen2.joinRoom(pairing.pin!);
 * ```
 */
export class BroadcastChannelTransport<TPeer extends Peer = Peer, TState = any> extends RelayTransport<TPeer, TState> {
  readonly kind = 'broadcast' as const;

  private readonly channelPrefix: string;
  private readonly injectedChannel?: BroadcastChannelConstructor;

  constructor(options: BroadcastChannelTransportOptions = {}) {
    // Delivery is in-process and fast, so a short claim window is enough.
    super(options, { claimWindowMs: 100 });
    this.channelPrefix = options.channelPrefix ?? 'snap-pair';
    this.injectedChannel = options.BroadcastChannel;
  }

  private get Channel(): BroadcastChannelConstructor | undefined {
    return this.injectedChannel ?? (globalThis as { BroadcastChannel?: BroadcastChannelConstructor }).BroadcastChannel;
  }

  protected async prepare(): Promise<void> {
    if (typeof this.Channel !== 'function') {
      throw new TransportError(
        'unsupported',
        'BroadcastChannel is not available here. It needs a modern browser (Safari 15.4+), a worker, or Node 18+; '
          + 'pass `BroadcastChannel` in the options to use a polyfill.',
      );
    }
  }

  protected async openLink(roomKey: string, _role: PeerRole, handlers: RelayLinkHandlers): Promise<RelayLink> {
    const Channel = this.Channel;
    if (!Channel) throw new TransportError('unsupported', 'BroadcastChannel is not available here.');
    const channel = new Channel(`${this.channelPrefix}:${roomKey}`);
    const onMessage = (event: MessageEvent) => handlers.onFrame(event.data);
    channel.addEventListener('message', onMessage);
    return {
      send: (frame) => channel.postMessage(frame),
      close: () => {
        channel.removeEventListener('message', onMessage);
        channel.close();
      },
    };
  }
}
