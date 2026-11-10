import { useEffect } from 'react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useLyricsStore } from '../stores/useLyricsStore';
import { useWindowsControlStore } from '../stores/useWindowsControlStore';
import { tauriIpc } from '../services/tauriIpc';

export function useAdaptiveSync() {
  const setPlaybackState = usePlayerStore((s) => s.setPlaybackState);
  const setPollingStatus = usePlayerStore((s) => s.setPollingStatus);
  const setNetworkStatus = usePlayerStore((s) => s.setNetworkStatus);
  const fetchDevices = usePlayerStore((s) => s.fetchDevices);
  const playbackState = usePlayerStore((s) => s.playbackState);

  // 1. Listen for background polling, state changes, and network outages
  useEffect(() => {
    let unlistenState: (() => void) | undefined;
    let unlistenStatus: (() => void) | undefined;
    let unlistenNetwork: (() => void) | undefined;

    // Listen for state changes emitted by Rust poller (Remote mode)
    tauriIpc.onPlayerStateChanged((state) => {
      // If local SDK is active, ignore remote poll updates to preserve 0-latency local updates
      const { isSdkActive } = usePlayerStore.getState();
      if (!isSdkActive) {
        setPlaybackState(state);
      }
    }).then((unlisten) => {
      unlistenState = unlisten;
    });

    // Listen for polling toggle status events from Rust
    tauriIpc.onPollingStatusChanged(({ isPolling, isSdkActive }) => {
      setPollingStatus(isPolling, isSdkActive);
    }).then((unlisten) => {
      unlistenStatus = unlisten;
    });

    // Listen for network outage and recovery status from Rust
    tauriIpc.onNetworkStatusChanged(({ isOnline, retryAfterSecs }) => {
      setNetworkStatus(isOnline, retryAfterSecs);
    }).then((unlisten) => {
      unlistenNetwork = unlisten;
    });

    // Initial sync of devices, current playback, playlists, and library
    usePlayerStore.getState().initialSyncAll();

    return () => {
      unlistenState?.();
      unlistenStatus?.();
      unlistenNetwork?.();
    };
  }, [setPlaybackState, setPollingStatus, setNetworkStatus, fetchDevices]);

  // 2. Automatically prefetch synchronized lyrics whenever current track changes
  useEffect(() => {
    const track = playbackState?.track;
    if (track?.id) {
      useLyricsStore.getState().fetchLyricsForTrack(
        track.id,
        track.name,
        track.artists[0] || '',
        track.albumName,
        track.durationMs,
      );
    }
  }, [playbackState?.track?.id]);

  // 3. Centralized millisecond-precision lyrics ticker (50ms interval)
  // Keeps activeLineIndex updated for HardwareStudioView, SyncedLyricsView, and other subscribers
  useEffect(() => {
    if (!playbackState?.isPlaying) return;

    const tick = () => {
      const currentMs = usePlayerStore.getState().getSmoothProgressMs();
      const offsetMs = useLyricsStore.getState().manualOffsetMs;
      useLyricsStore.getState().updateProgress(currentMs + offsetMs);
    };

    tick();
    const interval = setInterval(tick, 50);

    return () => clearInterval(interval);
  }, [playbackState?.isPlaying]);

  // 4. Windows System Media Tracker (VLC, Brave, Chrome, YouTube, Instagram, etc.)
  // Rule: Spotify has absolute priority. Windows media is tracked in useWindowsControlStore
  // and fed to the ESP32 Hardware Deck only when Spotify is idle.
  // It NEVER overwrites or corrupts Spotify's player state in the desktop app.
  useEffect(() => {
    let isMounted = true;

    const checkWinMedia = async () => {
      try {
        const winMedia = await tauriIpc.windowsGetCurrentMedia();
        if (isMounted) {
          useWindowsControlStore.getState().setWindowsMedia(winMedia);
        }
      } catch (err) {
        console.warn('[AdaptiveSync] Windows media query failed:', err);
      }
    };

    checkWinMedia();
    const interval = setInterval(checkWinMedia, 1500);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);
}
