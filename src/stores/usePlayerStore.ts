import { create } from 'zustand';
import { DeviceDto, PlayerStateDto, PlaylistDto, SearchResultDto, TrackDto } from '../types/models';
import { tauriIpc } from '../services/tauriIpc';

interface PlayerState {
  playbackState: PlayerStateDto | null;
  devices: DeviceDto[];
  localDeviceId: string | null;
  activeDeviceId: string | null;
  isSdkActive: boolean;
  isPolling: boolean;
  isOnline: boolean;
  networkRetrySecs: number;
  isLoadingDevices: boolean;
  isSwitchingDevice: boolean;

  // Browse & Search state
  userPlaylists: PlaylistDto[];
  topTracks: TrackDto[];
  searchResults: SearchResultDto | null;
  isLoadingBrowse: boolean;
  searchQuery: string;

  // Hardware Deck Screen Sync
  deckScreen: 'now_playing' | 'lyrics' | 'clock' | 'weather';
  setDeckScreen: (screen: 'now_playing' | 'lyrics' | 'clock' | 'weather') => void;

  setPlaybackState: (state: PlayerStateDto | null) => void;
  setDevices: (devices: DeviceDto[]) => void;
  setLocalDeviceId: (id: string | null) => void;
  setSdkActive: (active: boolean) => void;
  setPollingStatus: (isPolling: boolean, isSdkActive: boolean) => void;
  setNetworkStatus: (isOnline: boolean, retrySecs: number) => void;
  optimisticTransferDevice: (deviceId: string) => void;
  setOptimisticVolume: (volumePercent: number) => void;
  optimisticSeek: (positionMs: number) => void;
  getSmoothProgressMs: () => number;
  initialSyncAll: () => Promise<void>;

  fetchDevices: () => Promise<void>;
  fetchState: () => Promise<void>;
  fetchPlaylists: () => Promise<void>;
  fetchTopTracks: () => Promise<void>;
  searchSpotify: (query: string) => Promise<void>;
  playUri: (uri: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
}

let switchTimeout: ReturnType<typeof setTimeout> | null = null;
let lastStateReceivedAt = performance.now();
let lastBaseProgressMs = 0;
let lastSeekTime = 0;
let seekLockTargetMs = 0;

export const usePlayerStore = create<PlayerState>((set, get) => ({
  playbackState: null,
  devices: [],
  localDeviceId: null,
  activeDeviceId: null,
  isSdkActive: false,
  isPolling: true,
  isOnline: true,
  networkRetrySecs: 0,
  isLoadingDevices: false,
  isSwitchingDevice: false,

  deckScreen: (localStorage.getItem('dc_deck_screen') as 'now_playing' | 'lyrics' | 'clock') || 'now_playing',
  setDeckScreen: (screen) => {
    localStorage.setItem('dc_deck_screen', screen);
    set({ deckScreen: screen });
  },

  userPlaylists: [],
  topTracks: [],
  searchResults: null,
  isLoadingBrowse: false,
  searchQuery: '',

  setPlaybackState: (state: PlayerStateDto | null) => {
    const now = performance.now();
    const wallNow = Date.now();

    // 4000ms Seek Lock: Reject stale poller snapshots after a user seek until Spotify servers catch up
    const timeSinceSeek = now - lastSeekTime;
    if (lastSeekTime > 0 && timeSinceSeek < 4000) {
      const expectedProgress = seekLockTargetMs + (state?.isPlaying ? timeSinceSeek : 0);
      const pollDiscrepancy = Math.abs((state?.progressMs || 0) - expectedProgress);
      if (pollDiscrepancy > 1500) {
        // Poller is still returning stale pre-seek data from Spotify servers.
        // Update track metadata and playing state if present, but protect seek position
        if (state) {
          const currentProgress = Math.round(seekLockTargetMs + (state.isPlaying ? timeSinceSeek : 0));
          lastBaseProgressMs = currentProgress;
          lastStateReceivedAt = now;
          set({
            playbackState: {
              ...state,
              progressMs: currentProgress,
              timestamp: wallNow,
            },
          });
        }
        return;
      } else {
        // Poller snapshot has caught up to the seek target
        lastSeekTime = 0;
      }
    }

    if (state && state.isPlaying) {
      // Compensate for Spotify server-to-client network latency:
      // state.timestamp is the exact Unix ms timestamp when Spotify's server snapshot was generated.
      let transitLatencyMs = 0;
      if (state.timestamp && state.timestamp > 0) {
        const diff = wallNow - state.timestamp;
        if (diff >= 0 && diff < 3000) {
          // Bounded latency compensation (protect against abnormal system clock skew)
          transitLatencyMs = Math.min(diff, 1200);
        }
      }

      const targetProgressMs = Math.min(
        state.durationMs || Infinity,
        state.progressMs + transitLatencyMs
      );

      // Phase-Locked Slew / Drift Filter:
      // If continuing on the same track, avoid abrupt jumps by absorbing minor network jitter smoothly
      const currentTrackId = get().playbackState?.track?.id;
      if (lastBaseProgressMs > 0 && currentTrackId === state.track?.id) {
        const localEstimated = lastBaseProgressMs + (now - lastStateReceivedAt);
        const drift = targetProgressMs - localEstimated;

        if (Math.abs(drift) < 800) {
          // Subtle drift (<800ms) is slewed without phase jump (damping factor 0.55)
          lastBaseProgressMs = localEstimated + drift * 0.55;
        } else {
          // Significant jump (>800ms) indicates a manual seek or track transition -> snap directly
          lastBaseProgressMs = targetProgressMs;
        }
      } else {
        lastBaseProgressMs = targetProgressMs;
      }
      lastStateReceivedAt = now;
    } else {
      lastBaseProgressMs = state ? state.progressMs : 0;
      lastStateReceivedAt = now;
    }

    const localId = get().localDeviceId;
    const isSwitching = get().isSwitchingDevice;
    const currentActiveId = get().activeDeviceId;

    let preparedState = state
      ? {
          ...state,
          timestamp: wallNow,
        }
      : null;

    let activeId = preparedState?.device?.id || null;
    let targetState = preparedState;

    if (isSwitching && currentActiveId && activeId !== currentActiveId) {
      if (preparedState) {
        targetState = {
          ...preparedState,
          device: get().devices.find((d) => d.id === currentActiveId) || preparedState.device,
        };
      }
      activeId = currentActiveId;
    } else if (isSwitching && activeId === currentActiveId) {
      set({ isSwitchingDevice: false });
    }

    const isSdkActive = Boolean(localId && activeId && localId === activeId && targetState?.isPlaying);

    set({
      playbackState: targetState,
      activeDeviceId: activeId,
      isSdkActive,
    });
  },

  setDevices: (devices: DeviceDto[]) => {
    const isSwitching = get().isSwitchingDevice;
    const currentActiveId = get().activeDeviceId;

    if (isSwitching && currentActiveId) {
      const updated = devices.map((d) => ({
        ...d,
        isActive: d.id === currentActiveId,
      }));
      set({ devices: updated });
      return;
    }

    const activeDevice = devices.find((d) => d.isActive);
    set({
      devices,
      activeDeviceId: activeDevice?.id || get().activeDeviceId,
    });
  },

  setLocalDeviceId: (id: string | null) => {
    set({ localDeviceId: id });
  },

  setSdkActive: (isSdkActive: boolean) => {
    // Deduplicate: only write to store if value actually changed
    if (get().isSdkActive !== isSdkActive) {
      set({ isSdkActive });
    }
  },

  setPollingStatus: (isPolling: boolean, isSdkActive: boolean) => {
    // Deduplicate: only write to store if either value actually changed
    const state = get();
    if (state.isPolling !== isPolling || state.isSdkActive !== isSdkActive) {
      set({ isPolling, isSdkActive });
    }
  },

  setNetworkStatus: (isOnline: boolean, retrySecs: number) => {
    const state = get();
    if (state.isOnline !== isOnline || state.networkRetrySecs !== retrySecs) {
      set({ isOnline, networkRetrySecs: retrySecs });
    }
  },

  optimisticTransferDevice: (deviceId: string) => {
    if (switchTimeout) clearTimeout(switchTimeout);

    const devices = get().devices.map((d) => ({
      ...d,
      isActive: d.id === deviceId,
    }));

    const targetDevice = devices.find((d) => d.id === deviceId) || null;
    const currentPlayback = get().playbackState;

    set({
      isSwitchingDevice: true,
      activeDeviceId: deviceId,
      devices,
      playbackState: currentPlayback
        ? {
            ...currentPlayback,
            device: targetDevice || currentPlayback.device,
          }
        : null,
    });

    switchTimeout = setTimeout(() => {
      set({ isSwitchingDevice: false });
    }, 3500);
  },

  setOptimisticVolume: (volumePercent: number) => {
    const current = get().playbackState;
    const activeId = get().activeDeviceId;
    const updatedDevices = get().devices.map((d) =>
      d.id === activeId ? { ...d, volumePercent } : d
    );
    set({
      devices: updatedDevices,
      playbackState: current
        ? {
            ...current,
            device: current.device ? { ...current.device, volumePercent } : null,
          }
        : null,
    });
  },

  optimisticSeek: (positionMs: number) => {
    lastSeekTime = performance.now();
    seekLockTargetMs = positionMs;
    lastBaseProgressMs = positionMs;
    lastStateReceivedAt = performance.now();
    const current = get().playbackState;
    if (current) {
      set({
        playbackState: {
          ...current,
          progressMs: positionMs,
        },
      });
    }
  },

  getSmoothProgressMs: () => {
    const state = get().playbackState;
    if (!state) return 0;
    if (!state.isPlaying) return state.progressMs;
    const elapsed = Math.max(0, performance.now() - lastStateReceivedAt);
    return Math.min(state.durationMs || Infinity, Math.max(0, lastBaseProgressMs + elapsed));
  },

  initialSyncAll: async () => {
    try {
      await Promise.allSettled([
        get().fetchState(),
        get().fetchDevices(),
        get().fetchPlaylists(),
        get().fetchTopTracks(),
      ]);
    } catch (err) {
      console.warn('Initial sync failed:', err);
    }
  },

  fetchDevices: async () => {
    try {
      set({ isLoadingDevices: true });
      const devices = await tauriIpc.spotifyGetDevices();
      get().setDevices(devices);
    } catch (err) {
      console.warn('Failed to fetch devices:', err);
    } finally {
      set({ isLoadingDevices: false });
    }
  },

  fetchState: async () => {
    try {
      const state = await tauriIpc.spotifyGetState();
      get().setPlaybackState(state);
    } catch (err) {
      console.warn('Failed to fetch player state:', err);
    }
  },

  fetchPlaylists: async () => {
    try {
      set({ isLoadingBrowse: true });
      const playlists = await tauriIpc.spotifyGetPlaylists();
      set({ userPlaylists: playlists });
    } catch (err) {
      console.warn('Failed to fetch playlists:', err);
    } finally {
      set({ isLoadingBrowse: false });
    }
  },

  fetchTopTracks: async () => {
    try {
      const tracks = await tauriIpc.spotifyGetTopTracks();
      set({ topTracks: tracks });
    } catch (err) {
      console.warn('Failed to fetch top tracks:', err);
    }
  },

  searchSpotify: async (query: string) => {
    if (!query.trim()) {
      set({ searchResults: null, searchQuery: '' });
      return;
    }
    try {
      set({ isLoadingBrowse: true, searchQuery: query });
      const results = await tauriIpc.spotifySearch(query);
      set({ searchResults: results });
    } catch (err) {
      console.warn('Failed to search Spotify:', err);
    } finally {
      set({ isLoadingBrowse: false });
    }
  },

  playUri: async (uri: string) => {
    try {
      const activeId = get().activeDeviceId || undefined;
      await tauriIpc.spotifyPlayUri(uri, activeId);
      setTimeout(() => {
        get().fetchState();
      }, 600);
    } catch (err) {
      console.error('Failed to play URI:', err);
    }
  },

  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
  },
}));
