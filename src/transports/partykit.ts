import { TransportError, type Peer, type PeerRole } from '../core/types';
import { encodeWire } from './protocol';
import { RelayTransport, type RelayLink, type RelayLinkHandlers, type RelayTransportOptions } from './relay';

/** The subset of `WebSocket` (and partysocket's `PartySocket`) this transport uses. */
export interface PartyKitSocketLike {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
  addEventListener(type: 'open' | 'close' | 'message' | 'error', listener: (event: any) => void): void;
  removeEventListener(type: 'open' | 'close' | 'message' | 'error', listener: (event: any) => void): void;
  /** Present on partysocket's reconnecting socket; plain WebSockets are reopened by the transport instead. */
  reconnect?: (code?: number, reason?: string) => void;
}

export interface PartyKitSocketParams {
  /** PartyKit host, e.g. `'my-app.my-user.partykit.dev'` or `'localhost:1999'`. */
  host: string;
  /** Party name (`'main'` is the default party in partykit.json). */
  party: string;
  /** Room name: the derived room key, never the raw code or PIN. */
  room: string;
  /** Connection id; the server sees it as `connection.id` and it equals the peer id. */
  id: string;
  protocol?: 'ws' | 'wss';
}

export type PartyKitSocketFactory = (params: PartyKitSocketParams) => PartyKitSocketLike;

export interface PartyKitTransportOptions extends RelayTransportOptions {
  host: string;
  /** Default: `'main'`. */
  party?: string;
  /** Default: `ws` for localhost / 127.0.0.1 / private IPv4 hosts, `wss` otherwise. */
  protocol?: 'ws' | 'wss';
  /**
   * Opens a socket. Default: `partysocket` if it can be imported, else the
   * global `WebSocket` with a URL from `buildPartyKitUrl`. Pass one when
   * bundling: `socketFactory: (p) => new PartySocket(p)`.
   */
  socketFactory?: PartyKitSocketFactory;
  /** How long to wait for the first `open`. Default: 10000 ms. */
  connectTimeoutMs?: number;
  /** First retry delay for plain WebSockets (doubles up to 10 s). Default: 1000 ms. */
  reconnectDelayMs?: number;
}

const OPEN = 1;
const MAX_QUEUED_FRAMES = 256;
const MAX_RECONNECT_DELAY_MS = 10000;

const isLocalHost = (host: string) =>
  /^(localhost|127\.\d+\.\d+\.\d+|\[::1\]|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+)(:\d+)?$/i.test(host);

/**
 * WebSocket URL of a PartyKit room, matching what partysocket builds:
 * `wss://<host>/parties/<party>/<room>?_pk=<id>` (`/party/<room>` for `main`).
 */
export function buildPartyKitUrl({ host, party, room, id, protocol }: PartyKitSocketParams): string {
  const cleanHost = host.replace(/^(https?|wss?):\/\//, '').replace(/\/+$/, '');
  const scheme = protocol ?? (isLocalHost(cleanHost) ? 'ws' : 'wss');
  const path = party === 'main' ? `party/${encodeURIComponent(room)}` : `parties/${encodeURIComponent(party)}/${encodeURIComponent(room)}`;
  return `${scheme}://${cleanHost}/${path}?_pk=${encodeURIComponent(id)}`;
}

/** Socket factory over a `WebSocket` constructor (the global one by default), or `null` if there is none. */
export function createWebSocketFactory(
  WebSocketImpl: (new (url: string) => PartyKitSocketLike) | undefined
    = (globalThis as { WebSocket?: new (url: string) => PartyKitSocketLike }).WebSocket,
): PartyKitSocketFactory | null {
  if (typeof WebSocketImpl !== 'function') return null;
  return (params) => new WebSocketImpl(buildPartyKitUrl(params));
}

// A variable specifier keeps TypeScript and bundlers from requiring the optional
// peer dependency. Bundled apps should pass `socketFactory` explicitly.
const PARTYSOCKET_MODULE = 'partysocket';

/** Loads the optional `partysocket` peer dependency; `null` when it is not installed or not resolvable. */
export async function loadPartySocketFactory(
  importer: (specifier: string) => Promise<any> = (specifier) => import(/* @vite-ignore */ /* webpackIgnore: true */ specifier),
): Promise<PartyKitSocketFactory | null> {
  try {
    const mod = await importer(PARTYSOCKET_MODULE);
    const PartySocket = mod?.PartySocket ?? mod?.default;
    if (typeof PartySocket !== 'function') return null;
    return ({ host, party, room, id, protocol }) => new PartySocket({ host, party, room, id, protocol }) as PartyKitSocketLike;
  } catch {
    return null;
  }
}

/**
 * Internet transport over a PartyKit room (one WebSocket per peer). The party
 * server only relays frames and announces dropped sockets; the host browser
 * stays authoritative, exactly like `BroadcastChannelTransport`. A minimal
 * server is in `examples/partykit/`. Wire format: JSON text frames, see
 * `./protocol.ts`.
 *
 * `partysocket` is an optional peer dependency. Without it (or without a
 * `socketFactory`), the global `WebSocket` is used and the transport
 * reconnects it with exponential backoff.
 */
export class PartyKitTransport<TPeer extends Peer = Peer, TState = any> extends RelayTransport<TPeer, TState> {
  readonly kind = 'partykit' as const;

  private readonly partyOptions: PartyKitTransportOptions;
  private factory: PartyKitSocketFactory | null = null;

  constructor(options: PartyKitTransportOptions) {
    super(options, { claimWindowMs: 400 });
    this.partyOptions = options;
  }

  protected async prepare(): Promise<void> {
    if (!this.partyOptions.host) throw new TransportError('invalid', 'PartyKitTransport needs a `host`.');
    this.factory = this.partyOptions.socketFactory
      ?? (await loadPartySocketFactory())
      ?? createWebSocketFactory();
    if (!this.factory) {
      throw new TransportError('unsupported', 'No WebSocket implementation found. Install `partysocket` or pass `socketFactory`.');
    }
  }

  protected openLink(roomKey: string, _role: PeerRole, handlers: RelayLinkHandlers): Promise<RelayLink> {
    const factory = this.factory;
    if (!factory) return Promise.reject(new TransportError('not-connected', 'Call connect() before using the room.'));
    const { host, party = 'main', protocol, connectTimeoutMs = 10000, reconnectDelayMs = 1000 } = this.partyOptions;
    const params: PartyKitSocketParams = { host, party, room: roomKey, id: this.peerId, protocol };

    return new Promise<RelayLink>((resolve, reject) => {
      const queue: string[] = [];
      let socket: PartyKitSocketLike | null = null;
      let opened = false;
      let closed = false;
      let attempts = 0;
      let retryTimer: ReturnType<typeof setTimeout> | null = null;

      const link: RelayLink = {
        send: (frame) => {
          const data = encodeWire(frame);
          if (socket?.readyState === OPEN) socket.send(data);
          else if (queue.length < MAX_QUEUED_FRAMES) queue.push(data);
        },
        close: () => {
          if (closed) return;
          closed = true;
          clearTimeout(openTimer);
          if (retryTimer) clearTimeout(retryTimer);
          const current = socket;
          detach();
          current?.close(1000, 'leave');
        },
      };

      const onOpen = () => {
        attempts = 0;
        while (queue.length && socket?.readyState === OPEN) socket.send(queue.shift()!);
        if (!opened) {
          opened = true;
          clearTimeout(openTimer);
          resolve(link);
        } else {
          handlers.onOpen();
        }
      };
      const onMessage = (event: { data?: unknown }) => {
        if (typeof event?.data === 'string') handlers.onFrame(event.data);
      };
      const onClose = () => {
        if (closed) return;
        if (opened) handlers.onClose();
        if (socket?.reconnect) return; // partysocket reconnects by itself and fires `open` again.
        detach();
        scheduleRetry();
      };

      function scheduleRetry() {
        const delay = Math.min(reconnectDelayMs * 2 ** attempts, MAX_RECONNECT_DELAY_MS);
        attempts += 1;
        retryTimer = setTimeout(attach, delay);
      }

      function detach() {
        if (!socket) return;
        socket.removeEventListener('open', onOpen);
        socket.removeEventListener('message', onMessage);
        socket.removeEventListener('close', onClose);
        socket = null;
      }

      function attach() {
        retryTimer = null;
        if (closed) return;
        try {
          socket = factory!(params);
        } catch (error) {
          if (opened) scheduleRetry();
          else fail(new TransportError('backend', `Could not open a PartyKit socket: ${(error as Error)?.message ?? error}`));
          return;
        }
        socket.addEventListener('open', onOpen);
        socket.addEventListener('message', onMessage);
        socket.addEventListener('close', onClose);
        if (socket.readyState === OPEN) onOpen();
      }

      function fail(error: TransportError) {
        if (opened) return;
        link.close();
        reject(error);
      }

      const openTimer = setTimeout(
        () => fail(new TransportError('backend', `Timed out connecting to PartyKit at ${host}.`)),
        connectTimeoutMs,
      );
      attach();
    });
  }
}
