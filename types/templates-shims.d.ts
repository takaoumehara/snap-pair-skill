// Typecheck-only shims for template dependencies that this repo does not
// install (generated apps get the real packages and their types).
declare module 'partysocket' {
  export default class PartySocket {
    constructor(options: { host: string; party?: string; room: string; id?: string; protocol?: 'ws' | 'wss' });
    readonly readyState: number;
    send(data: string): void;
    close(code?: number, reason?: string): void;
    reconnect(code?: number, reason?: string): void;
    addEventListener(type: string, listener: (event: any) => void): void;
    removeEventListener(type: string, listener: (event: any) => void): void;
  }
}

declare module 'qrcode' {
  const QRCode: {
    toDataURL(text: string, options?: Record<string, unknown>): Promise<string>;
  };
  export default QRCode;
}
