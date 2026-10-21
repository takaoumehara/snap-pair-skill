/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ShakeDetector, requestMotionPermission, isMotionSupported } from './shake';

describe('shake detection', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock DeviceMotionEvent if not available in jsdom
    if (typeof globalThis.DeviceMotionEvent === 'undefined') {
      (globalThis as any).DeviceMotionEvent = class DeviceMotionEvent extends Event {
        accelerationIncludingGravity: any;
        constructor(type: string, init?: any) {
          super(type);
          this.accelerationIncludingGravity = init?.accelerationIncludingGravity || null;
        }
      };
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  describe('isMotionSupported', () => {
    it('returns true when DeviceMotionEvent exists', () => {
      expect(isMotionSupported()).toBe(true);
    });
  });

  describe('requestMotionPermission', () => {
    it('returns "unsupported" when requestPermission is not available', async () => {
      const result = await requestMotionPermission();
      expect(result).toBe('unsupported');
    });

    it('returns "granted" when permission is granted (mocked)', async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue('granted');
      (DeviceMotionEvent as any).requestPermission = mockRequestPermission;

      const result = await requestMotionPermission();
      expect(result).toBe('granted');
      expect(mockRequestPermission).toHaveBeenCalled();

      delete (DeviceMotionEvent as any).requestPermission;
    });

    it('returns "denied" when permission is denied (mocked)', async () => {
      const mockRequestPermission = vi.fn().mockResolvedValue('denied');
      (DeviceMotionEvent as any).requestPermission = mockRequestPermission;

      const result = await requestMotionPermission();
      expect(result).toBe('denied');

      delete (DeviceMotionEvent as any).requestPermission;
    });
  });

  describe('ShakeDetector', () => {
    it('starts and stops listening', () => {
      const detector = new ShakeDetector();
      expect(detector.isListening).toBe(false);

      detector.start();
      expect(detector.isListening).toBe(true);

      detector.stop();
      expect(detector.isListening).toBe(false);
    });

    it('detects shake when enough peaks occur within window', () => {
      const detector = new ShakeDetector({ threshold: 10, minPeaks: 3, windowMs: 1000 });
      const shakes: any[] = [];
      detector.onShake = (event) => shakes.push(event);

      detector.start();

      // Simulate acceleration events with peaks
      const dispatchMotion = (x: number, y: number, z: number) => {
        const event = new (globalThis as any).DeviceMotionEvent('devicemotion', {
          accelerationIncludingGravity: { x, y, z },
        });
        window.dispatchEvent(event);
      };

      // First peak
      dispatchMotion(15, 0, 0); // magnitude ~15
      vi.advanceTimersByTime(200);

      // Second peak
      dispatchMotion(0, 15, 0); // magnitude ~15
      vi.advanceTimersByTime(200);

      // Third peak - should trigger shake
      dispatchMotion(0, 0, 15); // magnitude ~15

      expect(shakes).toHaveLength(1);
      expect(shakes[0].peakStrength).toBeGreaterThan(0);

      detector.stop();
    });

    it('respects cooldown period between shakes', () => {
      const detector = new ShakeDetector({ threshold: 10, minPeaks: 2, cooldownMs: 500 });
      const shakes: any[] = [];
      detector.onShake = (event) => shakes.push(event);

      detector.start();

      const dispatchMotion = (mag: number) => {
        const event = new (globalThis as any).DeviceMotionEvent('devicemotion', {
          accelerationIncludingGravity: { x: mag, y: 0, z: 0 },
        });
        window.dispatchEvent(event);
      };

      // First shake
      dispatchMotion(15);
      dispatchMotion(15);
      expect(shakes).toHaveLength(1);

      // Try another shake immediately (should be ignored)
      dispatchMotion(15);
      dispatchMotion(15);
      expect(shakes).toHaveLength(1);

      // Wait for cooldown and shake again
      vi.advanceTimersByTime(600);
      dispatchMotion(15);
      dispatchMotion(15);
      expect(shakes).toHaveLength(2);

      detector.stop();
    });
  });
});
