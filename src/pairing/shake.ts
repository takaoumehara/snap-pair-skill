/**
 * Shake detection for iOS Safari and other browsers.
 * iOS 13+ requires DeviceMotionEvent.requestPermission() from a user gesture.
 */

export interface ShakeEvent {
  timestamp: number;
  peakStrength: number;
}

export interface ShakeDetectorOptions {
  /** Acceleration magnitude threshold (g). Default: 15. */
  threshold?: number;
  /** Time window for detecting ~3 peaks (ms). Default: 1000. */
  windowMs?: number;
  /** Minimum peaks within the window. Default: 3. */
  minPeaks?: number;
  /** Minimum time between detected shakes (ms). Default: 800. */
  cooldownMs?: number;
}

interface Peak {
  timestamp: number;
  magnitude: number;
}

const DEFAULT_THRESHOLD = 15;
const DEFAULT_WINDOW_MS = 1000;
const DEFAULT_MIN_PEAKS = 3;
const DEFAULT_COOLDOWN_MS = 800;

/**
 * Requests DeviceMotion permission on iOS 13+. Must be called from a user gesture.
 * Returns 'granted', 'denied', or 'unsupported' (no permission needed).
 */
export async function requestMotionPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
  if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
  
  const PermissionEvent = DeviceMotionEvent as unknown as {
    requestPermission?: () => Promise<PermissionState>;
  };

  if (typeof PermissionEvent.requestPermission === 'function') {
    try {
      const result = await PermissionEvent.requestPermission();
      return result === 'granted' ? 'granted' : 'denied';
    } catch {
      return 'denied';
    }
  }
  
  return 'unsupported'; // Not iOS or doesn't need permission
}

/**
 * Shake detector. Call `start()` after getting motion permission, `stop()` to clean up.
 * Emits `onShake` when a shake is detected (~3 acceleration peaks within 1s).
 */
export class ShakeDetector {
  private readonly options: Required<ShakeDetectorOptions>;
  private readonly peaks: Peak[] = [];
  private lastShakeTime = 0;
  private listener: ((event: DeviceMotionEvent) => void) | null = null;
  
  /** Called when a shake is detected. */
  public onShake: ((event: ShakeEvent) => void) | null = null;

  constructor(options: ShakeDetectorOptions = {}) {
    this.options = {
      threshold: options.threshold ?? DEFAULT_THRESHOLD,
      windowMs: options.windowMs ?? DEFAULT_WINDOW_MS,
      minPeaks: options.minPeaks ?? DEFAULT_MIN_PEAKS,
      cooldownMs: options.cooldownMs ?? DEFAULT_COOLDOWN_MS,
    };
  }

  /** Start listening for shake events. */
  public start(): void {
    if (this.listener) return;
    
    this.listener = (event: DeviceMotionEvent) => {
      const acc = event.accelerationIncludingGravity;
      if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

      const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
      const now = Date.now();

      // Remove old peaks outside the window
      while (this.peaks.length && now - this.peaks[0].timestamp > this.options.windowMs) {
        this.peaks.shift();
      }

      // Detect a peak (local maximum)
      if (magnitude > this.options.threshold) {
        this.peaks.push({ timestamp: now, magnitude });
        
        // Check if we have enough peaks for a shake
        if (this.peaks.length >= this.options.minPeaks && now - this.lastShakeTime > this.options.cooldownMs) {
          this.lastShakeTime = now;
          const maxPeak = Math.max(...this.peaks.map(p => p.magnitude));
          this.peaks.length = 0; // Clear peaks after detecting a shake
          
          if (this.onShake) {
            this.onShake({ timestamp: now, peakStrength: Math.min(maxPeak, 50) }); // Cap at 50
          }
        }
      }
    };

    window.addEventListener('devicemotion', this.listener);
  }

  /** Stop listening for shake events. */
  public stop(): void {
    if (this.listener) {
      window.removeEventListener('devicemotion', this.listener);
      this.listener = null;
    }
    this.peaks.length = 0;
  }

  /** Whether the detector is currently listening. */
  public get isListening(): boolean {
    return this.listener !== null;
  }
}

/** True if DeviceMotion API is available. */
export function isMotionSupported(): boolean {
  return typeof DeviceMotionEvent !== 'undefined';
}
