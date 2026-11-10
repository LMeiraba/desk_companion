import { PlayerStateDto, TrackDto } from '../types/models';
import { useAuthStore } from '../stores/useAuthStore';
import { usePlayerStore } from '../stores/usePlayerStore';
import { tauriIpc } from './tauriIpc';

class SpotifySdkService {
  private player: Spotify.Player | null = null;
  private isScriptLoaded = false;
  private isInitializing = false;
  private currentVolume = 0.8;
  private lastSdkActiveState: boolean | null = null;

  public async initialize(): Promise<void> {
    if (this.player || this.isInitializing) return;
    this.isInitializing = true;

    try {
      await this.loadSdkScript();

      const player = new window.Spotify.Player({
        name: 'Desk Companion Desktop',
        getOAuthToken: async (cb) => {
          try {
            const token = await useAuthStore.getState().getFreshToken();
            cb(token);
          } catch (err) {
            console.error('Failed to get token for Web Playback SDK:', err);
          }
        },
        volume: 0.8,
      });

      player.addListener('ready', ({ device_id }) => {
        console.log('[SpotifySDK] Ready with device ID:', device_id);
        usePlayerStore.getState().setLocalDeviceId(device_id);
        usePlayerStore.getState().fetchDevices();
      });

      player.addListener('not_ready', ({ device_id }) => {
        console.warn('[SpotifySDK] Device ID went offline:', device_id);
        usePlayerStore.getState().setLocalDeviceId(null);
      });

      player.addListener('player_state_changed', (state) => {
        this.handlePlayerStateChanged(state);
      });

      player.addListener('initialization_error', ({ message }) => {
        console.error('[SpotifySDK] Initialization error:', message);
      });

      player.addListener('authentication_error', ({ message }) => {
        console.error('[SpotifySDK] Authentication error:', message);
      });

      player.addListener('account_error', ({ message }) => {
        console.error('[SpotifySDK] Account error (Premium required):', message);
      });

      player.addListener('playback_error', ({ message }) => {
        console.error('[SpotifySDK] Playback error:', message);
      });

      const connected = await player.connect();
      if (connected) {
        this.player = player;
        console.log('[SpotifySDK] Successfully connected to Spotify Connect.');
      }
    } catch (err) {
      console.error('[SpotifySDK] Failed to initialize player:', err);
    } finally {
      this.isInitializing = false;
    }
  }

  private handlePlayerStateChanged(state: Spotify.WebPlaybackState | null) {
    if (!state) {
      if (this.lastSdkActiveState !== false) {
        this.lastSdkActiveState = false;
        tauriIpc.setSdkActive(false);
      }
      return;
    }

    const localDeviceId = usePlayerStore.getState().localDeviceId;
    const isPlaying = !state.paused;

    // Report SDK active state to Rust adaptive poller ONLY on actual state change
    if (this.lastSdkActiveState !== isPlaying) {
      this.lastSdkActiveState = isPlaying;
      tauriIpc.setSdkActive(isPlaying);
    }

    const currentTrack = state.track_window.current_track;
    const trackDto: TrackDto | null = currentTrack
      ? {
          id: currentTrack.id,
          uri: currentTrack.uri,
          name: currentTrack.name,
          artists: currentTrack.artists.map((a) => a.name),
          albumName: currentTrack.album.name,
          albumArtUrl: currentTrack.album.images[0]?.url || '',
          durationMs: state.duration,
        }
      : null;

    const normalizedState: PlayerStateDto = {
      isPlaying,
      progressMs: state.position,
      durationMs: state.duration,
      track: trackDto,
      device: localDeviceId
        ? {
            id: localDeviceId,
            name: 'Desk Companion Desktop',
            deviceType: 'Computer',
            isActive: true,
            volumePercent: Math.round(this.currentVolume * 100),
            isRestricted: false,
          }
        : null,
      repeatMode: state.repeat_mode === 1 ? 'context' : state.repeat_mode === 2 ? 'track' : 'off',
      shuffleState: state.shuffle,
      timestamp: Date.now(),
    };

    usePlayerStore.getState().setPlaybackState(normalizedState);
  }

  public async setVolume(volume0to1: number): Promise<void> {
    this.currentVolume = Math.max(0, Math.min(1, volume0to1));
    if (this.player) {
      await this.player.setVolume(this.currentVolume);
    }
  }

  public getVolume(): number {
    return this.currentVolume;
  }

  public getPlayer(): Spotify.Player | null {
    return this.player;
  }

  public disconnect(): void {
    if (this.player) {
      this.player.disconnect();
      this.player = null;
      usePlayerStore.getState().setLocalDeviceId(null);
      if (this.lastSdkActiveState !== false) {
        this.lastSdkActiveState = false;
        tauriIpc.setSdkActive(false);
      }
    }
  }

  private loadSdkScript(): Promise<void> {
    if (this.isScriptLoaded || window.Spotify) {
      return Promise.resolve();
    }

    return new Promise((resolve) => {
      window.onSpotifyWebPlaybackSDKReady = () => {
        this.isScriptLoaded = true;
        resolve();
      };

      const script = document.createElement('script');
      script.src = 'https://sdk.scdn.co/spotify-player.js';
      script.async = true;
      document.body.appendChild(script);
    });
  }
}

export const spotifySdk = new SpotifySdkService();
