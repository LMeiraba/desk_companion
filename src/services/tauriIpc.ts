import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import {
  AuthSessionDto,
  DeviceDto,
  HotspotStatus,
  LyricsDto,
  NetworkStatusEvent,
  PlayerStateDto,
  PlaylistDto,
  PollingStatusEvent,
  SearchResultDto,
  TokenBundleDto,
  TrackDto,
  UnifiedPlaybackState,
} from '../types/models';

export const tauriIpc = {
  // Auth
  spotifyLogin: async (clientId: string): Promise<TokenBundleDto> => {
    return await invoke<TokenBundleDto>('spotify_login', { clientId });
  },

  spotifyLogout: async (): Promise<void> => {
    return await invoke<void>('spotify_logout');
  },

  spotifyGetTokens: async (): Promise<TokenBundleDto | null> => {
    return await invoke<TokenBundleDto | null>('spotify_get_tokens');
  },

  spotifyGetSession: async (): Promise<AuthSessionDto> => {
    return await invoke<AuthSessionDto>('spotify_get_session');
  },

  spotifyRefreshToken: async (): Promise<TokenBundleDto> => {
    return await invoke<TokenBundleDto>('spotify_refresh_token');
  },

  // Adaptive Polling Sync Toggle
  setSdkActive: async (active: boolean): Promise<void> => {
    return await invoke<void>('set_sdk_active', { active });
  },

  // Spotify Player
  spotifyGetState: async (): Promise<PlayerStateDto | null> => {
    return await invoke<PlayerStateDto | null>('spotify_get_state');
  },

  spotifyPlay: async (deviceId?: string): Promise<void> => {
    return await invoke<void>('spotify_play', { deviceId });
  },

  spotifyPause: async (deviceId?: string): Promise<void> => {
    return await invoke<void>('spotify_pause', { deviceId });
  },

  spotifyTogglePlay: async (deviceId?: string): Promise<void> => {
    return await invoke<void>('spotify_toggle_play', { deviceId });
  },

  spotifyNext: async (deviceId?: string): Promise<void> => {
    return await invoke<void>('spotify_next', { deviceId });
  },

  spotifyPrevious: async (deviceId?: string): Promise<void> => {
    return await invoke<void>('spotify_previous', { deviceId });
  },

  spotifySeek: async (positionMs: number, deviceId?: string): Promise<void> => {
    const roundedMs = Math.max(0, Math.round(positionMs));
    const cleanId = deviceId && deviceId.trim().length > 0 ? deviceId.trim() : null;
    return await invoke<void>('spotify_seek', { positionMs: roundedMs, deviceId: cleanId });
  },

  spotifySetVolume: async (volumePercent: number, deviceId?: string): Promise<void> => {
    return await invoke<void>('spotify_set_volume', { volumePercent, deviceId });
  },

  spotifyGetDevices: async (): Promise<DeviceDto[]> => {
    return await invoke<DeviceDto[]>('spotify_get_devices');
  },

  spotifyTransferPlayback: async (deviceId: string, play: boolean = true): Promise<void> => {
    return await invoke<void>('spotify_transfer_playback', { deviceId, play });
  },

  spotifyPlayUri: async (uri: string, deviceId?: string): Promise<void> => {
    return await invoke<void>('spotify_play_uri', { uri, deviceId });
  },

  spotifyGetPlaylists: async (): Promise<PlaylistDto[]> => {
    return await invoke<PlaylistDto[]>('spotify_get_playlists');
  },

  spotifyGetTopTracks: async (): Promise<TrackDto[]> => {
    return await invoke<TrackDto[]>('spotify_get_top_tracks');
  },

  spotifySearch: async (query: string): Promise<SearchResultDto> => {
    return await invoke<SearchResultDto>('spotify_search', { query });
  },

  lyricsGet: async (
    trackName: string,
    artistName: string,
    albumName?: string,
    durationMs?: number,
  ): Promise<LyricsDto | null> => {
    return await invoke<LyricsDto | null>('lyrics_get', {
      trackName,
      artistName,
      albumName,
      durationMs,
    });
  },

  // Generic Media
  mediaGetState: async (): Promise<UnifiedPlaybackState | null> => {
    return await invoke<UnifiedPlaybackState | null>('media_get_state');
  },

  // Window Controls
  setMiniPlayerMode: async (enabled: boolean): Promise<void> => {
    try {
      await invoke('set_mini_player_window', { enabled });
    } catch (err) {
      console.warn('setMiniPlayerMode failed (running in pure web browser?):', err);
    }
  },

  // Windows System Control
  windowsSetVolume: async (volumePercent: number): Promise<void> => {
    try {
      await invoke('windows_set_volume', { volumePercent: Math.round(volumePercent) });
    } catch (err) {
      console.warn('windowsSetVolume failed:', err);
    }
  },

  windowsGetVolume: async (): Promise<number> => {
    try {
      return await invoke<number>('windows_get_volume');
    } catch (err) {
      console.warn('windowsGetVolume failed:', err);
      return 50;
    }
  },

  windowsVolumeUp: async (steps?: number): Promise<void> => {
    try {
      await invoke('windows_volume_up', { steps });
    } catch (err) {
      console.warn('windowsVolumeUp failed:', err);
    }
  },

  windowsVolumeDown: async (steps?: number): Promise<void> => {
    try {
      await invoke('windows_volume_down', { steps });
    } catch (err) {
      console.warn('windowsVolumeDown failed:', err);
    }
  },

  windowsToggleMute: async (): Promise<void> => {
    try {
      await invoke('windows_toggle_mute');
    } catch (err) {
      console.warn('windowsToggleMute failed:', err);
    }
  },

  windowsMediaPlayPause: async (): Promise<void> => {
    try {
      await invoke('windows_media_play_pause');
    } catch (err) {
      console.warn('windowsMediaPlayPause failed:', err);
    }
  },

  windowsMediaNext: async (): Promise<void> => {
    try {
      await invoke('windows_media_next');
    } catch (err) {
      console.warn('windowsMediaNext failed:', err);
    }
  },

  windowsMediaPrevious: async (): Promise<void> => {
    try {
      await invoke('windows_media_previous');
    } catch (err) {
      console.warn('windowsMediaPrevious failed:', err);
    }
  },

  windowsSetBrightness: async (brightness: number): Promise<void> => {
    try {
      await invoke('windows_set_brightness', { brightness });
    } catch (err) {
      console.warn('windowsSetBrightness failed:', err);
    }
  },

  windowsGetBrightness: async (): Promise<number> => {
    try {
      return await invoke<number>('windows_get_brightness');
    } catch (err) {
      console.warn('windowsGetBrightness failed:', err);
      return 100;
    }
  },

  windowsSendNotification: async (title: string, body: string): Promise<void> => {
    try {
      await invoke('windows_send_notification', { title, body });
    } catch (err) {
      console.warn('windowsSendNotification failed:', err);
    }
  },

  windowsSetAutostart: async (enabled: boolean): Promise<void> => {
    try {
      await invoke('windows_set_autostart', { enabled });
    } catch (err) {
      console.warn('windowsSetAutostart failed:', err);
    }
  },

  windowsGetAutostart: async (): Promise<boolean> => {
    try {
      return await invoke<boolean>('windows_get_autostart');
    } catch (err) {
      console.warn('windowsGetAutostart failed:', err);
      return false;
    }
  },

  windowsGetCurrentMedia: async (): Promise<{
    source: string;
    title: string;
    artist: string;
    album: string;
    isPlaying: boolean;
    albumArtUrl?: string;
    timestamp: number;
  } | null> => {
    try {
      return await invoke('windows_get_current_media');
    } catch (err) {
      console.warn('windowsGetCurrentMedia failed:', err);
      return null;
    }
  },

  // Wi-Fi Direct Hotspot (Standalone 2.4 GHz AP)
  hotspotStart: async (ssid?: string, password?: string): Promise<HotspotStatus> => {
    return await invoke<HotspotStatus>('hotspot_start', { ssid, password });
  },

  hotspotStop: async (): Promise<HotspotStatus> => {
    return await invoke<HotspotStatus>('hotspot_stop');
  },

  hotspotGetStatus: async (): Promise<HotspotStatus> => {
    return await invoke<HotspotStatus>('hotspot_get_status');
  },

  resolveHostname: async (hostname: string): Promise<string> => {
    try {
      return await invoke<string>('resolve_hostname', { hostname });
    } catch {
      return hostname;
    }
  },

  // Event Listeners
  onPlayerStateChanged: async (cb: (state: PlayerStateDto) => void): Promise<UnlistenFn> => {
    return await listen<PlayerStateDto>('spotify://state-changed', (event) => cb(event.payload));
  },

  onPollingStatusChanged: async (cb: (status: PollingStatusEvent) => void): Promise<UnlistenFn> => {
    return await listen<PollingStatusEvent>('spotify://polling-status', (event) => cb(event.payload));
  },

  onNetworkStatusChanged: async (cb: (status: NetworkStatusEvent) => void): Promise<UnlistenFn> => {
    return await listen<NetworkStatusEvent>('spotify://network-status', (event) => cb(event.payload));
  },
};
