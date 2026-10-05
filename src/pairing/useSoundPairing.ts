import { useCallback, useEffect, useRef, useState } from 'react';
import {
  isSoundPairSupported,
  normalizeSoundToken,
  startSoundEmitter,
  startSoundListener,
  type SoundEmitOptions,
  type SoundListener,
  type SoundListenOptions,
  type SoundEmitter,
} from './sound';

export interface UseSoundPairingOptions {
  /** PIN or room code to emit. When null/invalid, emit is a no-op. */
  token?: string | null;
  /** Auto-start the emitter when `token` is set. Default false. */
  emit?: boolean;
  /** Auto-start the mic listener. Default false. */
  listen?: boolean;
  onToken?: (token: string) => void;
  emitOptions?: SoundEmitOptions;
  listenOptions?: SoundListenOptions;
}

export interface UseSoundPairingResult {
  supported: boolean;
  emitting: boolean;
  listening: boolean;
  lastToken: string | null;
  error: string | null;
  startEmit: () => Promise<void>;
  stopEmit: () => void;
  startListen: () => Promise<void>;
  stopListen: () => void;
}

/**
 * React helper for experimental ultrasonic (Proximity) pairing.
 * Default HostHUD stays QR+PIN; opt into this hook (or HostHUD's sound toggle)
 * when you want the host to chirp and/or the guest to listen.
 */
export function useSoundPairing(options: UseSoundPairingOptions = {}): UseSoundPairingResult {
  const { token, emit = false, listen = false, onToken, emitOptions, listenOptions } = options;
  const [emitting, setEmitting] = useState(false);
  const [listening, setListening] = useState(false);
  const [lastToken, setLastToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const emitterRef = useRef<SoundEmitter | null>(null);
  const listenerRef = useRef<SoundListener | null>(null);
  const onTokenRef = useRef(onToken);
  onTokenRef.current = onToken;
  const supported = typeof window !== 'undefined' ? isSoundPairSupported() : false;

  const stopEmit = useCallback(() => {
    emitterRef.current?.stop();
    emitterRef.current = null;
    setEmitting(false);
  }, []);

  const stopListen = useCallback(() => {
    listenerRef.current?.stop();
    listenerRef.current = null;
    setListening(false);
  }, []);

  const startEmit = useCallback(async () => {
    const normalized = normalizeSoundToken(token ?? '');
    if (!normalized) {
      setError('sound pairing needs a 4–12 character A–Z/0–9 token');
      return;
    }
    stopEmit();
    try {
      emitterRef.current = await startSoundEmitter(normalized, emitOptions);
      setEmitting(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setEmitting(false);
    }
  }, [token, emitOptions, stopEmit]);

  const startListen = useCallback(async () => {
    stopListen();
    try {
      listenerRef.current = await startSoundListener((decoded) => {
        setLastToken(decoded);
        onTokenRef.current?.(decoded);
      }, listenOptions);
      setListening(true);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setListening(false);
    }
  }, [listenOptions, stopListen]);

  useEffect(() => {
    if (emit) void startEmit();
    else stopEmit();
    return () => stopEmit();
  }, [emit, token, startEmit, stopEmit]);

  useEffect(() => {
    if (listen) void startListen();
    else stopListen();
    return () => stopListen();
  }, [listen, startListen, stopListen]);

  useEffect(
    () => () => {
      stopEmit();
      stopListen();
    },
    [stopEmit, stopListen],
  );

  return { supported, emitting, listening, lastToken, error, startEmit, stopEmit, startListen, stopListen };
}
