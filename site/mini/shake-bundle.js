/**
 * Shake pairing bundle for mini apps.
 * Handles shake detection, PartyKit shake lobby, room creation, and WebRTC transport.
 */

(function (global) {
  'use strict';

  // ===== Shake Detection =====
  
  async function requestMotionPermission() {
    if (typeof DeviceMotionEvent === 'undefined') return 'unsupported';
    
    if (typeof DeviceMotionEvent.requestPermission === 'function') {
      try {
        const result = await DeviceMotionEvent.requestPermission();
        return result === 'granted' ? 'granted' : 'denied';
      } catch {
        return 'denied';
      }
    }
    
    return 'unsupported';
  }

  class ShakeDetector {
    constructor(options = {}) {
      this.threshold = options.threshold || 15;
      this.windowMs = options.windowMs || 1000;
      this.minPeaks = options.minPeaks || 3;
      this.cooldownMs = options.cooldownMs || 800;
      this.peaks = [];
      this.lastShakeTime = 0;
      this.listener = null;
      this.onShake = null;
    }

    start() {
      if (this.listener) return;
      
      this.listener = (event) => {
        const acc = event.accelerationIncludingGravity;
        if (!acc || acc.x === null || acc.y === null || acc.z === null) return;

        const magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
        const now = Date.now();

        while (this.peaks.length && now - this.peaks[0].timestamp > this.windowMs) {
          this.peaks.shift();
        }

        if (magnitude > this.threshold) {
          this.peaks.push({ timestamp: now, magnitude });
          
          if (this.peaks.length >= this.minPeaks && now - this.lastShakeTime > this.cooldownMs) {
            this.lastShakeTime = now;
            const maxPeak = Math.max(...this.peaks.map(p => p.magnitude));
            this.peaks = [];
            
            if (this.onShake) {
              this.onShake({ timestamp: now, peakStrength: Math.min(maxPeak, 50) });
            }
          }
        }
      };

      window.addEventListener('devicemotion', this.listener);
    }

    stop() {
      if (this.listener) {
        window.removeEventListener('devicemotion', this.listener);
        this.listener = null;
      }
      this.peaks = [];
    }
  }

  // ===== Shake Lobby =====

  class ShakeLobby {
    constructor(options = {}) {
      this.host = options.host || 'snap-pair-demo.takaoumehara.partykit.dev';
      this.appId = options.appId || 'unknown';
      this.ws = null;
      this.onPaired = null;
      this.onWaiting = null;
      this.onAmbiguous = null;
      this.onError = null;
    }

    connect() {
      return new Promise((resolve, reject) => {
        const url = `wss://${this.host}/parties/shake-lobby/lobby`;
        this.ws = new WebSocket(url);

        this.ws.onopen = () => resolve();
        this.ws.onerror = () => {
          const error = new Error('Failed to connect to shake lobby');
          if (this.onError) this.onError(error);
          reject(error);
        };

        this.ws.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'shake-paired' && this.onPaired) {
              this.onPaired(msg.roomCode);
            } else if (msg.type === 'shake-waiting' && this.onWaiting) {
              this.onWaiting();
            } else if (msg.type === 'shake-ambiguous' && this.onAmbiguous) {
              this.onAmbiguous();
            }
          } catch (e) {
            if (this.onError) this.onError(e);
          }
        };
      });
    }

    sendShake(shakeEvent) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'shake',
          appId: this.appId,
          timestamp: shakeEvent.timestamp,
          peakStrength: shakeEvent.peakStrength,
        }));
      }
    }

    disconnect() {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    }
  }

  // ===== Room Code & QR =====

  function normalizeRoomCode(code) {
    return String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  function formatRoomCode(code) {
    const norm = normalizeRoomCode(code);
    return norm.length === 6 ? `${norm.slice(0, 3)} ${norm.slice(3)}` : norm;
  }

  function generateQR(text, size = 200) {
    // Simple fallback: return null if QR library not available
    if (typeof QRCode === 'undefined') return null;
    const canvas = document.createElement('canvas');
    QRCode.toCanvas(canvas, text, { width: size, margin: 2 });
    return canvas;
  }

  // ===== Simple BroadcastChannel Transport =====

  class SimpleBroadcastTransport {
    constructor(roomCode) {
      this.roomCode = roomCode;
      this.channel = new BroadcastChannel(`snap-pair-mini/${roomCode}`);
      this.peerId = randomId();
      this.onMessage = null;
      
      this.channel.onmessage = (e) => {
        if (this.onMessage && e.data && e.data.from !== this.peerId) {
          this.onMessage(e.data);
        }
      };
    }

    send(type, payload) {
      this.channel.postMessage({
        type,
        payload,
        from: this.peerId,
        timestamp: Date.now(),
      });
    }

      close() {
      this.channel.close();
    }
  }

  // ===== PartyKit WebSocket Transport =====

  class PartyKitTransport {
    constructor(roomCode, options = {}) {
      this.roomCode = roomCode;
      this.host = options.host || 'localhost:1999';
      this.partyName = options.partyName || 'main';
      this.peerId = randomId();
      this.onMessage = null;
      this.connected = false;
      this.messageQueue = [];
      
      this.connect();
    }

    connect() {
      const protocol = this.host.startsWith('localhost') ? 'ws' : 'wss';
      const wsUrl = `${protocol}://${this.host}/parties/${this.partyName}/${encodeURIComponent(this.roomCode)}?_pk=${this.peerId}`;
      
      this.ws = new WebSocket(wsUrl);
      
      this.ws.addEventListener('open', () => {
        this.connected = true;
        while (this.messageQueue.length > 0) {
          const msg = this.messageQueue.shift();
          this.ws.send(msg);
        }
      });

      this.ws.addEventListener('message', (event) => {
        try {
          const frame = JSON.parse(event.data);
          if (frame.v === 1 && frame.from !== this.peerId && this.onMessage) {
            this.onMessage({
              type: frame.t,
              payload: frame.payload,
              from: frame.from,
              timestamp: frame.timestamp || Date.now()
            });
          }
        } catch (e) {
          console.error('PartyKit message parse error:', e);
        }
      });

      this.ws.addEventListener('close', () => {
        this.connected = false;
      });

      this.ws.addEventListener('error', (error) => {
        console.error('PartyKit WebSocket error:', error);
      });
    }

    send(type, payload) {
      const frame = JSON.stringify({
        v: 1,
        room: this.roomCode,
        from: this.peerId,
        t: type,
        payload,
        timestamp: Date.now()
      });

      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(frame);
      } else {
        this.messageQueue.push(frame);
      }
    }

    close() {
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
    }
  }

  // ===== Utilities =====

  function randomId() {
    const a = new Uint8Array(8);
    crypto.getRandomValues(a);
    return Array.from(a).map(b => b.toString(16).padStart(2, '0')).join('');
  }

  function getUrlParam(name) {
    const params = new URLSearchParams(window.location.search);
    return params.get(name);
  }

  function buildJoinUrl(baseUrl, roomCode) {
    const url = new URL(baseUrl, window.location.href);
    url.searchParams.set('room', roomCode);
    return url.href;
  }

  // ===== Export to global =====

  global.ShakePairing = {
    requestMotionPermission,
    ShakeDetector,
    ShakeLobby,
    SimpleBroadcastTransport,
    PartyKitTransport,
    normalizeRoomCode,
    formatRoomCode,
    generateQR,
    randomId,
    getUrlParam,
    buildJoinUrl,
  };

})(typeof window !== 'undefined' ? window : global);
