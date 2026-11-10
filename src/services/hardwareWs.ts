import { controlRouter } from './controlRouter';
import { usePlayerStore } from '../stores/usePlayerStore';
import { tauriIpc } from './tauriIpc';

import { WeatherData } from './weatherService';

export interface HardwareStatePayload {
  screen: 'lyrics' | 'now_playing' | 'clock' | 'weather';
  track: string;
  artist: string;
  albumArtUrl: string;
  albumArtB64?: string | null;
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
  currentLyricLine: string | null;
  prevLyricLine?: string | null;
  nextLyricLine?: string | null;
  lines?: string[];
  accentColor: string;
  volumeMode: 'spotify' | 'system' | 'app';
  volumePercent: number;
  timeStr?: string;
  dateStr?: string;
  weather?: WeatherData;
}

type HardwareEventListener = (data: { type: string; payload: any }) => void;

class HardwareWebSocketService {
  private socket: WebSocket | null = null;
  private url = 'ws://desk-companion.local:81';
  private targetAddress = 'desk-companion.local';
  private isConnected = false;
  private listeners: Set<HardwareEventListener> = new Set();
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldAutoReconnect = true;

  public async connect(targetAddress: string = '10.26.152.127') {
    this.targetAddress = targetAddress;
    this.shouldAutoReconnect = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    let host = targetAddress.trim().replace(/^ws:\/\//i, '').replace(/\/$/, '');
    if (host.includes('.local')) {
      try {
        const resolved = await tauriIpc.resolveHostname(host.split(':')[0]);
        if (resolved && resolved !== host.split(':')[0]) {
          console.log(`[HardwareWS] Resolved mDNS ${host} -> ${resolved}`);
          host = host.includes(':') ? `${resolved}:${host.split(':')[1]}` : resolved;
        }
      } catch (err) {
        console.warn('[HardwareWS] Hostname resolution failed:', err);
      }
    }

    const fullUrl = host.includes(':') ? `ws://${host}` : `ws://${host}:81`;

    // Prevent redundant reconnections if already open or connecting to the exact same URL
    if (
      this.socket &&
      (this.socket.readyState === WebSocket.OPEN || this.socket.readyState === WebSocket.CONNECTING) &&
      this.url === fullUrl
    ) {
      console.log('[HardwareWS] Already connected or connecting to', fullUrl);
      return;
    }

    this.url = fullUrl;

    // Cleanly tear down existing socket without triggering cascading onclose reconnects
    if (this.socket) {
      this.socket.onopen = null;
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      try {
        this.socket.close();
      } catch {
        // Ignored
      }
      this.socket = null;
    }

    try {
      this.socket = new WebSocket(fullUrl);

      this.socket.onopen = () => {
        console.log('[HardwareWS] Connected to ESP32 at', fullUrl);
        if (this.reconnectTimer) {
          clearTimeout(this.reconnectTimer);
          this.reconnectTimer = null;
        }
        this.isConnected = true;
        this.emit('connection', { connected: true, url: fullUrl });
      };

      this.socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          this.handleInboundMessage(msg);
          this.emit('message', msg);
        } catch {
          // Ignore non-JSON ping/pong
        }
      };

      this.socket.onclose = (event: CloseEvent) => {
        console.warn(`[HardwareWS] Socket closed (code=${event.code}, reason='${event.reason}', clean=${event.wasClean})`);
        this.isConnected = false;
        this.emit('connection', { connected: false, url: fullUrl });
        this.scheduleReconnect();
      };

      this.socket.onerror = (err) => {
        console.warn('[HardwareWS] Socket error event:', err);
        this.isConnected = false;
      };
    } catch (err) {
      this.isConnected = false;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect() {
    if (!this.shouldAutoReconnect || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.isConnected && this.shouldAutoReconnect) {
        this.connect(this.targetAddress);
      }
    }, 4000);
  }

  public disconnect() {
    this.shouldAutoReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.isConnected = false;
    this.emit('connection', { connected: false, url: this.url });
  }

  public sendState(payload: HardwareStatePayload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      // Hardware protection: Never send massive data: URIs (e.g. from Windows Media thumbnails)
      // across WebSocket, as they exceed ESP32 frame buffer and cause immediate disconnection.
      if (payload.albumArtUrl && payload.albumArtUrl.startsWith('data:')) {
        payload.albumArtUrl = '';
      }

      let json = JSON.stringify(payload);
      if (json.length > 3600) {
        console.warn(`[HardwareWS] Payload length (${json.length} bytes) exceeds safety limit. Stripping heavy fields.`);
        payload.albumArtB64 = undefined;
        payload.albumArtUrl = '';
        json = JSON.stringify(payload);
      }

      try {
        this.socket.send(json);
      } catch (err) {
        console.warn('[HardwareWS] Failed to send state frame:', err);
      }
    }
  }

  public sendConfig(payload: { type: string; [key: string]: any }) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
    // Also emit locally so the UI / simulator receives notifications immediately
    if (payload.type === 'notification_alert') {
      this.emit('notification', payload);
    }
  }

  public getIsConnected(): boolean {
    return this.isConnected;
  }

  public getTargetUrl(): string {
    return this.url;
  }

  public subscribe(cb: HardwareEventListener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private emit(type: string, payload: any) {
    this.listeners.forEach((cb) => cb({ type, payload }));
  }

  /**
   * Handle incoming knob turns and button clicks from the ESP32
   */
  private handleInboundMessage(msg: any) {
    if (!msg || typeof msg !== 'object') return;

    const knobId = Number(msg.id) || 0;

    // Rotary Encoder rotation:
    if (msg.type === 'encoder') {
      const delta = Number(msg.delta) || 0;

      // Knob 1: Volume Control for active target mode (Spotify / System / App)
      if (knobId === 1 || msg.action === 'volume') {
        const curVol = usePlayerStore.getState().playbackState?.device?.volumePercent ?? 50;
        const nextVol = Math.max(0, Math.min(100, curVol + delta * 5));
        console.log(`[HardwareWs] Knob 1 Volume rotate delta=${delta} -> ${nextVol}%`);
        controlRouter.setVolume(nextVol);
        return;
      }

      // Knob 3: Screen Switcher rotation
      if (knobId === 3 || msg.action === 'screen_cycle') {
        const screens: ('lyrics' | 'now_playing' | 'clock' | 'weather')[] = ['lyrics', 'now_playing', 'clock', 'weather'];
        const current = usePlayerStore.getState().deckScreen;
        const nextIndex = (screens.indexOf(current) + (delta > 0 ? 1 : -1) + screens.length) % screens.length;
        const next = screens[nextIndex];
        console.log(`[HardwareWs] Knob 3 rotate -> ${next}`);
        usePlayerStore.getState().setDeckScreen(next);
        this.sendConfig({ type: 'set_screen', screen: next });
        return;
      }

      // Default / Knob 2: Seek on scroll
      const currentMs = usePlayerStore.getState().getSmoothProgressMs();
      const durationMs = usePlayerStore.getState().playbackState?.durationMs || 1000;
      const nextMs = Math.max(0, Math.min(durationMs, currentMs + delta * 5000));
      console.log(`[HardwareWs] Knob 2 seek rotate delta=${delta} -> ${nextMs}ms`);
      controlRouter.seek(nextMs);
      return;
    }

    // Screen Mode Switch from Hardware
    if (msg.type === 'screen' && msg.screen) {
      console.log(`[HardwareWs] Hardware switched screen mode to: ${msg.screen}`);
      usePlayerStore.getState().setDeckScreen(msg.screen);
      return;
    }

    // Button actions:
    if (msg.type === 'button') {
      const press = msg.press || (msg.action === 'mute_toggle' ? 'single' : 'single');

      // Knob 1 Button actions:
      if (knobId === 1 || msg.action === 'mute_toggle' || msg.action === 'cycle_target') {
        if (press === 'double' || msg.action === 'cycle_target') {
          const nextMode = controlRouter.cycleVolumeMode();
          console.log(`[HardwareWs] Knob 1 double-click -> Switched Audio Target to: ${nextMode.toUpperCase()}`);
        } else {
          console.log('[HardwareWs] Knob 1 single-click -> Toggling Mute');
          controlRouter.toggleMute();
        }
        return;
      }

      // Knob 2 / Default Button actions:
      if (press === 'double') {
        console.log('[HardwareWs] Knob 2 double-click -> Previous Track');
        controlRouter.previousTrack();
      } else if (press === 'long') {
        console.log('[HardwareWs] Knob long-press -> Cycling Screen Mode');
        const screens: ('lyrics' | 'now_playing' | 'clock' | 'weather')[] = ['lyrics', 'now_playing', 'clock', 'weather'];
        const current = usePlayerStore.getState().deckScreen;
        const next = screens[(screens.indexOf(current) + 1) % screens.length];
        usePlayerStore.getState().setDeckScreen(next);
        this.sendConfig({ type: 'set_screen', screen: next });
      } else {
        console.log('[HardwareWs] Knob single-click -> Next Track');
        controlRouter.nextTrack();
      }
    }
  }
}

export const hardwareWs = new HardwareWebSocketService();
