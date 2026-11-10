export interface TrackDto {
  id: string;
  uri: string;
  name: string;
  artists: string[];
  albumName: string;
  albumArtUrl: string;
  durationMs: number;
}

export interface DeviceDto {
  id: string;
  name: string;
  deviceType: string;
  isActive: boolean;
  volumePercent: number;
  isRestricted: boolean;
}

export interface PlayerStateDto {
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  track: TrackDto | null;
  device: DeviceDto | null;
  repeatMode: string;
  shuffleState: boolean;
  timestamp: number;
}

export interface TokenBundleDto {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  expiresAt: number;
  tokenType: string;
}

export interface AuthSessionDto {
  isAuthenticated: boolean;
  clientId: string;
  expiresAt: number;
}

export interface UnifiedPlaybackState {
  sourceId: string;
  isPlaying: boolean;
  progressMs: number;
  durationMs: number;
  track: TrackDto | null;
  device: DeviceDto | null;
  volumePercent: number;
  timestamp: number;
}

export interface PollingStatusEvent {
  isPolling: boolean;
  isSdkActive: boolean;
}

export interface NetworkStatusEvent {
  isOnline: boolean;
  consecutiveErrors: number;
  retryAfterSecs: number;
}

export interface HotspotStatus {
  isRunning: boolean;
  ssid: string;
  password: string;
  message: string;
}

export interface PlaylistDto {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  trackCount: number;
  uri: string;
}

export interface SearchResultDto {
  tracks: TrackDto[];
  playlists: PlaylistDto[];
}

export interface LyricsDto {
  id?: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  durationSeconds?: number;
  instrumental: boolean;
  plainLyrics?: string;
  syncedLyrics?: string;
}

export interface LyricLine {
  timeMs: number;
  text: string;
}
