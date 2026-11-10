import { useEffect, useRef } from 'react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { useLyricsStore } from '../stores/useLyricsStore';
import { useWindowsControlStore } from '../stores/useWindowsControlStore';
import { hardwareWs } from '../services/hardwareWs';
import { extractDominantColor, generateThumbnailRGB565Base64 } from '../services/dominantColor';
import { weatherService, WeatherData } from '../services/weatherService';

/**
 * Global hook to stream player state and synchronized lyrics
 * directly to the ESP32 Desk Companion over WebSocket.
 * Operates globally regardless of which tab is active.
 */
export function useHardwareSync() {
  const { playbackState, deckScreen } = usePlayerStore();
  const { parsedLines, pacedLines, activeLineIndex, activePacedIndex, isSynced } = useLyricsStore();
  const dominantColorRef = useRef<string>('#10b981');
  const albumArtB64Ref = useRef<string | null>(null);
  const lastSentTimeRef = useRef<number>(0);
  const lastLineSentRef = useRef<number>(-999);
  const lastScreenSentRef = useRef<string>('');
  const lastTrackIdRef = useRef<string>('');
  const lastTrackSentRef = useRef<string>('');
  const forceResyncRef = useRef<boolean>(true);
  const weatherRef = useRef<WeatherData | null>(null);

  // Sync live weather every 10 minutes
  useEffect(() => {
    const fetchWeather = () => {
      weatherService.getWeather().then((w) => {
        weatherRef.current = w;
      });
    };
    fetchWeather();
    const weatherTimer = setInterval(fetchWeather, 10 * 60 * 1000);
    return () => clearInterval(weatherTimer);
  }, []);

  // Initialize Hardware WebSocket connection on app startup (reads last saved address if available)
  useEffect(() => {
    const savedAddress = localStorage.getItem('hardware_esp32_address') || '10.26.152.127';
    hardwareWs.connect(savedAddress);

    // When connection is established or reconnected, force a full resync
    const unsub = hardwareWs.subscribe(({ type, payload }) => {
      if (type === 'connection' && payload.connected) {
        forceResyncRef.current = true;
        lastTrackSentRef.current = '';
        lastScreenSentRef.current = '';
      }
    });

    return unsub;
  }, []);

  // Determine active media source (Spotify vs Windows Media)
  const winMedia = useWindowsControlStore((s) => s.windowsMedia);
  const isSpotifyPlaying = playbackState?.isPlaying ?? false;
  const useWinMedia = !isSpotifyPlaying && Boolean(winMedia?.isPlaying && winMedia?.title?.trim());

  const activeArtUrl = useWinMedia && winMedia ? (winMedia.albumArtUrl || '') : (playbackState?.track?.albumArtUrl || '');
  const activeTrackId = useWinMedia && winMedia ? `win_${winMedia.source}_${winMedia.title}` : (playbackState?.track?.id || '');

  // Update dynamic album accent color & generate 32x32 RGB565 thumbnail
  useEffect(() => {
    if (activeArtUrl && activeTrackId !== lastTrackIdRef.current) {
      lastTrackIdRef.current = activeTrackId;
      extractDominantColor(activeArtUrl).then((color) => {
        dominantColorRef.current = color;
      });
      generateThumbnailRGB565Base64(activeArtUrl, 32).then((b64) => {
        albumArtB64Ref.current = b64;
        // Thumbnail is now ready - trigger resync to send album art thumbnail to ESP32
        forceResyncRef.current = true;
      });
    }
  }, [activeArtUrl, activeTrackId]);

  // Periodic and event-driven state broadcast
  useEffect(() => {
    const broadcast = () => {
      const now = Date.now();
      const isSpotifyPlayingNow = playbackState?.isPlaying ?? false;
      const currentWinMedia = useWindowsControlStore.getState().windowsMedia;
      const currentUseWinMedia = !isSpotifyPlayingNow && Boolean(currentWinMedia?.isPlaying && currentWinMedia?.title?.trim());

      let progressMs = 0;
      let durationMs = 0;
      if (currentUseWinMedia && currentWinMedia) {
        progressMs = currentWinMedia.progressMs ?? 0;
        if (currentWinMedia.isPlaying && currentWinMedia.timestamp > 0) {
          progressMs += Math.max(0, now - currentWinMedia.timestamp);
        }
        durationMs = currentWinMedia.durationMs ?? 0;
        if (durationMs > 0 && progressMs > durationMs) {
          progressMs = durationMs;
        }
      } else {
        progressMs = usePlayerStore.getState().getSmoothProgressMs();
        durationMs = playbackState?.durationMs ?? 0;
      }
      const volumePercent = playbackState?.device?.volumePercent ?? 50;

      const trackTitle = currentUseWinMedia && currentWinMedia ? currentWinMedia.title : (playbackState?.track?.name || 'Desk Companion');
      const artistTitle = currentUseWinMedia && currentWinMedia ? (currentWinMedia.artist || currentWinMedia.source.toUpperCase()) : (playbackState?.track?.artists?.join(', ') || 'Idle');
      const currentArtUrl = currentUseWinMedia && currentWinMedia ? (currentWinMedia.albumArtUrl || '') : (playbackState?.track?.albumArtUrl || '');
      const activeIsPlaying = currentUseWinMedia && currentWinMedia ? currentWinMedia.isPlaying : isSpotifyPlayingNow;
      const trackId = currentUseWinMedia && currentWinMedia ? `win_${currentWinMedia.source}_${currentWinMedia.title}` : (playbackState?.track?.id || '');

      // Direct stream of paced sub-chunks: guarantees bold size 2 typography and 100% parity
      const stream = pacedLines && pacedLines.length > 0 ? pacedLines : parsedLines;
      const currentIndex = pacedLines && pacedLines.length > 0 ? activePacedIndex : activeLineIndex;

      const currentLyric = isSynced
        ? (currentIndex >= 0 && stream[currentIndex]
            ? stream[currentIndex].text
            : '♪ Instrumental ♪')
        : null;

      const prevLyric =
        isSynced && currentIndex > 0 && stream[currentIndex - 1]
          ? stream[currentIndex - 1].text
          : null;

      const nextLyric =
        isSynced && currentIndex >= 0 && currentIndex + 1 < stream.length
          ? stream[currentIndex + 1].text
          : null;

      const lines = [-2, -1, 0, 1, 2].map((offset) => {
        if (offset === 0 && currentIndex === -1 && isSynced) return '♪ Instrumental ♪';
        const idx = currentIndex + offset;
        return idx >= 0 && idx < stream.length ? stream[idx].text : '';
      });

      const isLineChanged = currentIndex !== lastLineSentRef.current;
      const isScreenChanged = deckScreen !== lastScreenSentRef.current;
      const isTrackChanged = trackId !== lastTrackSentRef.current;
      const isForceResync = forceResyncRef.current;
      const isThrottleExpired = now - lastSentTimeRef.current >= 350;

      // Send immediately on screen mode change, track change, lyric line change, force resync, or periodic progress tick
      if (isForceResync || isTrackChanged || isScreenChanged || isLineChanged || isThrottleExpired) {
        lastSentTimeRef.current = now;
        lastLineSentRef.current = activeLineIndex;
        lastScreenSentRef.current = deckScreen;
        if (isTrackChanged) {
          lastTrackSentRef.current = trackId;
        }
        if (isForceResync) {
          forceResyncRef.current = false;
        }

        // Send album thumbnail once on track transition or full initial resync
        const b64ToSend = (isTrackChanged || isForceResync) && albumArtB64Ref.current ? albumArtB64Ref.current : undefined;

        hardwareWs.sendState({
          screen: deckScreen,
          track: trackTitle,
          artist: artistTitle,
          albumArtUrl: currentArtUrl.startsWith('data:') ? '' : currentArtUrl,
          albumArtB64: b64ToSend,
          progressMs,
          durationMs,
          isPlaying: activeIsPlaying,
          currentLyricLine: currentLyric,
          prevLyricLine: prevLyric,
          nextLyricLine: nextLyric,
          lines,
          accentColor: dominantColorRef.current,
          volumeMode: 'spotify',
          volumePercent,
          timeStr: new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase(),
          dateStr: new Date().toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase(),
          weather: weatherRef.current || undefined,
        });
      }
    };

    broadcast();

    // Continuous ticker: 350ms while playing, 1000ms while paused/idle (ensures clock & status never freeze)
    const intervalMs = playbackState?.isPlaying ? 350 : 1000;
    const ticker = setInterval(broadcast, intervalMs);

    return () => {
      clearInterval(ticker);
    };
  }, [
    playbackState?.track?.id,
    playbackState?.track?.name,
    playbackState?.track?.artists,
    playbackState?.isPlaying,
    playbackState?.progressMs,
    playbackState?.durationMs,
    playbackState?.device?.volumePercent,
    winMedia?.title,
    winMedia?.artist,
    winMedia?.isPlaying,
    winMedia?.source,
    deckScreen,
    activeLineIndex,
    activePacedIndex,
    isSynced,
    parsedLines,
    pacedLines,
  ]);
}
