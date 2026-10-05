/**
 * Experimental Web Audio ultrasonic (Proximity) pairing.
 *
 * The host emits an inaudible ~18–20 kHz FSK tone that encodes a room token
 * (PIN or room code). A nearby phone page listens on the mic, demodulates the
 * token, then joins via the existing transport (`joinRoom` / PIN path).
 *
 * QR and 6-digit PIN remain the primary pairing methods. Sound is optional.
 *
 * Limitations (document these in product UI):
 * - Ambient noise and speaker quality hurt reliability.
 * - Guests must grant microphone permission.
 * - Browser support varies: Chrome/Edge are strongest; Safari is uneven;
 *   Firefox usually works with caveats around sample rate and autoplay.
 * - Not a secret: anyone in earshot can hear the token. Use `admit` for gates.
 */

export const SOUND_PAIR_MARK_HZ = 19_000;
export const SOUND_PAIR_SPACE_HZ = 18_000;
export const SOUND_PAIR_SAMPLE_RATE = 44_100;
export const SOUND_PAIR_BIT_MS = 40;
export const SOUND_PAIR_VERSION = 1;
/** Alternating 16-bit preamble so the decoder can lock onto bit boundaries. */
export const SOUND_PAIR_PREAMBLE = 0b1010_1010_1010_1010;
export const SOUND_PAIR_DEFAULT_GAIN = 0.2;

export interface SoundEncodeOptions {
  sampleRate?: number;
  markHz?: number;
  spaceHz?: number;
  bitDurationMs?: number;
  /** Peak amplitude 0..1. Default 0.2 (keep low — ultrasonic but avoid clipping). */
  amplitude?: number;
}

export interface SoundDecodeOptions {
  markHz?: number;
  spaceHz?: number;
  bitDurationMs?: number;
}

export interface SoundEmitOptions extends SoundEncodeOptions {
  /** How many times to play the frame. `Infinity` loops until `stop()`. Default 8. */
  repeats?: number;
  gain?: number;
  audioContext?: AudioContext;
}

export interface SoundListenOptions extends SoundDecodeOptions {
  /** Debounce duplicate tokens for this many ms. Default 1500. */
  debounceMs?: number;
  /** MediaStreamConstraints.audio override. */
  audio?: MediaTrackConstraints | boolean;
  audioContext?: AudioContext;
}

export interface SoundEmitter {
  stop(): void;
  readonly playing: boolean;
}

export interface SoundListener {
  stop(): void;
  readonly listening: boolean;
}

const TOKEN_PATTERN = /^[A-Z0-9]{4,12}$/;

/** Uppercase A–Z / 0–9 only; strips separators. Returns null when empty/invalid. */
export function normalizeSoundToken(token: string): string | null {
  const cleaned = String(token ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
  return TOKEN_PATTERN.test(cleaned) ? cleaned : null;
}

export function isSoundPairSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  return Boolean(AC) && typeof navigator !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia);
}

/** CRC-8/ATM (poly 0x07), used as a frame checksum. */
export function crc8(bytes: Uint8Array): number {
  let crc = 0;
  for (let i = 0; i < bytes.length; i += 1) {
    crc ^= bytes[i];
    for (let b = 0; b < 8; b += 1) {
      crc = crc & 0x80 ? ((crc << 1) ^ 0x07) & 0xff : (crc << 1) & 0xff;
    }
  }
  return crc & 0xff;
}

function tokenToBytes(token: string): Uint8Array {
  const out = new Uint8Array(token.length);
  for (let i = 0; i < token.length; i += 1) out[i] = token.charCodeAt(i) & 0xff;
  return out;
}

function bytesToBits(bytes: Uint8Array): number[] {
  const bits: number[] = [];
  for (let i = 0; i < bytes.length; i += 1) {
    const v = bytes[i];
    for (let b = 7; b >= 0; b -= 1) bits.push((v >> b) & 1);
  }
  return bits;
}

function bitsToBytes(bits: number[]): Uint8Array | null {
  if (bits.length % 8 !== 0) return null;
  const out = new Uint8Array(bits.length / 8);
  for (let i = 0; i < out.length; i += 1) {
    let v = 0;
    for (let b = 0; b < 8; b += 1) v = (v << 1) | (bits[i * 8 + b] & 1);
    out[i] = v;
  }
  return out;
}

function buildFrameBits(token: string): number[] {
  const payload = tokenToBytes(token);
  // Frame body: version byte + length byte + payload; CRC-8 covers the body.
  const body = new Uint8Array(2 + payload.length);
  body[0] = SOUND_PAIR_VERSION & 0xff;
  body[1] = payload.length & 0xff;
  body.set(payload, 2);
  const check = crc8(body);
  const frame = new Uint8Array(body.length + 1);
  frame.set(body, 0);
  frame[frame.length - 1] = check;

  const bits: number[] = [];
  for (let i = 15; i >= 0; i -= 1) bits.push((SOUND_PAIR_PREAMBLE >> i) & 1);
  bits.push(...bytesToBits(frame));
  return bits;
}

function writeTone(
  samples: Float32Array,
  offset: number,
  length: number,
  sampleRate: number,
  hz: number,
  amplitude: number,
): void {
  const twoPiF = (2 * Math.PI * hz) / sampleRate;
  const attack = Math.min(64, Math.floor(length / 8));
  for (let i = 0; i < length; i += 1) {
    let env = 1;
    if (i < attack) env = i / attack;
    else if (i > length - attack) env = (length - i) / attack;
    samples[offset + i] = Math.sin(twoPiF * (offset + i)) * amplitude * env;
  }
}

/**
 * Encode a PIN or room code to PCM float samples (−1..1). Pure function — no
 * Web Audio required. Round-trips with `decodeSoundToken` on the same buffer.
 */
export function encodeSoundToken(token: string, options: SoundEncodeOptions = {}): Float32Array {
  const normalized = normalizeSoundToken(token);
  if (!normalized) throw new Error(`sound pairing token must be 4–12 A–Z/0–9 characters, got "${token}"`);

  const sampleRate = options.sampleRate ?? SOUND_PAIR_SAMPLE_RATE;
  const markHz = options.markHz ?? SOUND_PAIR_MARK_HZ;
  const spaceHz = options.spaceHz ?? SOUND_PAIR_SPACE_HZ;
  const bitMs = options.bitDurationMs ?? SOUND_PAIR_BIT_MS;
  const amplitude = options.amplitude ?? SOUND_PAIR_DEFAULT_GAIN;
  const samplesPerBit = Math.max(8, Math.round((sampleRate * bitMs) / 1000));
  const bits = buildFrameBits(normalized);
  const samples = new Float32Array(bits.length * samplesPerBit);

  for (let i = 0; i < bits.length; i += 1) {
    writeTone(samples, i * samplesPerBit, samplesPerBit, sampleRate, bits[i] ? markHz : spaceHz, amplitude);
  }
  return samples;
}

/** Goertzel power at `hz` over `samples[start..start+length)`. */
function goertzelPower(samples: Float32Array, start: number, length: number, sampleRate: number, hz: number): number {
  const k = Math.round((length * hz) / sampleRate);
  const w = (2 * Math.PI * k) / length;
  const coeff = 2 * Math.cos(w);
  let s0 = 0;
  let s1 = 0;
  let s2 = 0;
  const end = Math.min(samples.length, start + length);
  for (let i = start; i < end; i += 1) {
    s0 = samples[i] + coeff * s1 - s2;
    s2 = s1;
    s1 = s0;
  }
  return s1 * s1 + s2 * s2 - coeff * s1 * s2;
}

function decodeBitsFromSamples(
  samples: Float32Array,
  sampleRate: number,
  bitMs: number,
  markHz: number,
  spaceHz: number,
  bitOffset: number,
): number[] {
  const samplesPerBit = Math.max(8, Math.round((sampleRate * bitMs) / 1000));
  const bits: number[] = [];
  // Skip a little attack envelope inside each bit.
  const margin = Math.min(16, Math.floor(samplesPerBit / 6));
  for (let start = bitOffset; start + samplesPerBit <= samples.length; start += samplesPerBit) {
    const mark = goertzelPower(samples, start + margin, samplesPerBit - 2 * margin, sampleRate, markHz);
    const space = goertzelPower(samples, start + margin, samplesPerBit - 2 * margin, sampleRate, spaceHz);
    bits.push(mark >= space ? 1 : 0);
  }
  return bits;
}

function findPreamble(bits: number[]): number {
  const target: number[] = [];
  for (let i = 15; i >= 0; i -= 1) target.push((SOUND_PAIR_PREAMBLE >> i) & 1);
  for (let i = 0; i + target.length <= bits.length; i += 1) {
    let ok = true;
    for (let j = 0; j < target.length; j += 1) {
      if (bits[i + j] !== target[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return i;
  }
  return -1;
}

function parseFrame(bitsAfterPreamble: number[]): string | null {
  if (bitsAfterPreamble.length < 24) return null;
  const bytes = bitsToBytes(bitsAfterPreamble.slice(0, Math.floor(bitsAfterPreamble.length / 8) * 8));
  if (!bytes || bytes.length < 3) return null;
  const version = bytes[0];
  if (version !== SOUND_PAIR_VERSION) return null;
  const length = bytes[1];
  if (length < 4 || length > 12) return null;
  if (bytes.length < 2 + length + 1) return null;
  const payload = bytes.subarray(2, 2 + length);
  const expected = bytes[2 + length];
  const body = bytes.subarray(0, 2 + length);
  if (crc8(body) !== expected) return null;
  let token = '';
  for (let i = 0; i < payload.length; i += 1) token += String.fromCharCode(payload[i]);
  return normalizeSoundToken(token);
}

/**
 * Decode PCM samples produced by `encodeSoundToken` (or a mic capture of it).
 * Returns the token or `null` when no valid frame is found.
 */
export function decodeSoundToken(
  samples: Float32Array,
  sampleRate: number,
  options: SoundDecodeOptions = {},
): string | null {
  if (!samples?.length || !sampleRate) return null;
  const markHz = options.markHz ?? SOUND_PAIR_MARK_HZ;
  const spaceHz = options.spaceHz ?? SOUND_PAIR_SPACE_HZ;
  const bitMs = options.bitDurationMs ?? SOUND_PAIR_BIT_MS;
  const samplesPerBit = Math.max(8, Math.round((sampleRate * bitMs) / 1000));

  // Try a few sub-bit offsets so slight drift still locks.
  const offsets = [0, Math.floor(samplesPerBit / 4), Math.floor(samplesPerBit / 2), Math.floor((3 * samplesPerBit) / 4)];
  for (const offset of offsets) {
    const bits = decodeBitsFromSamples(samples, sampleRate, bitMs, markHz, spaceHz, offset);
    const preambleAt = findPreamble(bits);
    if (preambleAt < 0) continue;
    const token = parseFrame(bits.slice(preambleAt + 16));
    if (token) return token;
  }
  return null;
}

function getAudioContext(existing?: AudioContext): AudioContext {
  if (existing) return existing;
  const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) throw new Error('Web Audio AudioContext is not available in this browser');
  return new AC();
}

/** Play an encoded token through the speakers (inaudible FSK). */
export async function startSoundEmitter(token: string, options: SoundEmitOptions = {}): Promise<SoundEmitter> {
  const ctx = getAudioContext(options.audioContext);
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);

  const samples = encodeSoundToken(token, {
    sampleRate: ctx.sampleRate || options.sampleRate || SOUND_PAIR_SAMPLE_RATE,
    markHz: options.markHz,
    spaceHz: options.spaceHz,
    bitDurationMs: options.bitDurationMs,
    amplitude: options.amplitude ?? options.gain ?? SOUND_PAIR_DEFAULT_GAIN,
  });

  const buffer = ctx.createBuffer(1, samples.length, ctx.sampleRate);
  // Copy into a fresh ArrayBuffer-backed view — satisfies stricter DOM typings.
  const channel = new Float32Array(new ArrayBuffer(samples.byteLength));
  channel.set(samples);
  buffer.copyToChannel(channel, 0);

  const gain = ctx.createGain();
  gain.gain.value = options.gain ?? SOUND_PAIR_DEFAULT_GAIN;
  gain.connect(ctx.destination);

  let playing = true;
  let source: AudioBufferSourceNode | null = null;
  const repeats = options.repeats ?? 8;

  const startSource = () => {
    if (!playing) return;
    source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = repeats === Infinity;
    source.connect(gain);
    if (repeats === Infinity) {
      source.start();
    } else {
      source.start(0, 0, (buffer.duration * repeats));
      source.onended = () => {
        playing = false;
        source = null;
      };
    }
  };
  startSource();

  return {
    get playing() {
      return playing;
    },
    stop() {
      playing = false;
      try {
        source?.stop();
      } catch {
        /* already stopped */
      }
      source = null;
      try {
        gain.disconnect();
      } catch {
        /* noop */
      }
    },
  };
}

/** Listen on the microphone and invoke `onToken` when a valid frame is decoded. */
export async function startSoundListener(
  onToken: (token: string) => void,
  options: SoundListenOptions = {},
): Promise<SoundListener> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new Error('getUserMedia is not available — microphone permission cannot be requested');
  }
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: options.audio ?? {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
    },
  });
  const ctx = getAudioContext(options.audioContext);
  if (ctx.state === 'suspended') await ctx.resume().catch(() => undefined);

  const source = ctx.createMediaStreamSource(stream);
  const processor = ctx.createScriptProcessor(4096, 1, 1);
  const silent = ctx.createGain();
  silent.gain.value = 0;

  const ring = new Float32Array(Math.ceil(ctx.sampleRate * 4)); // ~4s ring
  let ringWrite = 0;
  let listening = true;
  let lastToken: string | null = null;
  let lastAt = 0;
  const debounceMs = options.debounceMs ?? 1500;

  processor.onaudioprocess = (event) => {
    if (!listening) return;
    const input = event.inputBuffer.getChannelData(0);
    for (let i = 0; i < input.length; i += 1) {
      ring[ringWrite] = input[i];
      ringWrite = (ringWrite + 1) % ring.length;
    }
    // Linearize a 2.5s window ending at ringWrite for decode attempts.
    const windowLen = Math.min(ring.length, Math.floor(ctx.sampleRate * 2.5));
    const window = new Float32Array(windowLen);
    const start = (ringWrite - windowLen + ring.length) % ring.length;
    for (let i = 0; i < windowLen; i += 1) window[i] = ring[(start + i) % ring.length];

    const token = decodeSoundToken(window, ctx.sampleRate, options);
    if (!token) return;
    const now = Date.now();
    if (token === lastToken && now - lastAt < debounceMs) return;
    lastToken = token;
    lastAt = now;
    onToken(token);
  };

  source.connect(processor);
  processor.connect(silent);
  silent.connect(ctx.destination);

  return {
    get listening() {
      return listening;
    },
    stop() {
      listening = false;
      try {
        processor.disconnect();
        source.disconnect();
        silent.disconnect();
      } catch {
        /* noop */
      }
      for (const track of stream.getTracks()) track.stop();
    },
  };
}
