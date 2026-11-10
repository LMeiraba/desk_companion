import { create } from 'zustand';
import { LyricLine, LyricsDto } from '../types/models';
import { tauriIpc } from '../services/tauriIpc';
import { parseLrcLyrics, parsePlainLyrics } from '../services/lyricsParser';
import { expandAndPaceLyrics, PacedLyricLine } from '../services/lyricsPacer';

interface LyricsState {
  lyrics: LyricsDto | null;
  parsedLines: LyricLine[];
  pacedLines: PacedLyricLine[];
  isLoading: boolean;
  currentTrackId: string | null;
  activeLineIndex: number;
  activePacedIndex: number;
  isSynced: boolean;
  manualOffsetMs: number;
  isPacedMode: boolean;

  setIsPacedMode: (enabled: boolean) => void;
  togglePacedMode: () => void;
  fetchLyricsForTrack: (
    trackId: string,
    trackName: string,
    artistName: string,
    albumName?: string,
    durationMs?: number,
  ) => Promise<void>;
  updateProgress: (progressMs: number) => void;
  setManualOffsetMs: (offset: number) => void;
  adjustManualOffsetMs: (delta: number) => void;
  reset: () => void;
}

export const useLyricsStore = create<LyricsState>((set, get) => ({
  lyrics: null,
  parsedLines: [],
  pacedLines: [],
  isLoading: false,
  currentTrackId: null,
  activeLineIndex: -1,
  activePacedIndex: -1,
  isSynced: false,
  manualOffsetMs: 0,
  isPacedMode: localStorage.getItem('dc_split_lyrics') !== 'false',

  setIsPacedMode: (enabled: boolean) => {
    localStorage.setItem('dc_split_lyrics', String(enabled));
    set({ isPacedMode: enabled });
  },

  togglePacedMode: () => {
    const next = !get().isPacedMode;
    localStorage.setItem('dc_split_lyrics', String(next));
    set({ isPacedMode: next });
  },

  fetchLyricsForTrack: async (
    trackId: string,
    trackName: string,
    artistName: string,
    albumName?: string,
    durationMs?: number,
  ) => {
    // Avoid re-fetching if same track and already have lyrics
    if (get().currentTrackId === trackId && get().lyrics) {
      return;
    }

    // Load any saved manual offset for this specific track
    let savedOffset = 0;
    try {
      const stored = localStorage.getItem(`dc_lyric_offset_${trackId}`);
      if (stored) {
        savedOffset = parseInt(stored, 10) || 0;
      }
    } catch {
      // Ignore localStorage errors
    }

    set({
      isLoading: true,
      currentTrackId: trackId,
      activeLineIndex: -1,
      activePacedIndex: -1,
      lyrics: null,
      parsedLines: [],
      pacedLines: [],
      isSynced: false,
      manualOffsetMs: savedOffset,
    });

    try {
      const data = await tauriIpc.lyricsGet(trackName, artistName, albumName, durationMs);

      if (!data) {
        set({ lyrics: null, parsedLines: [], pacedLines: [], isLoading: false, isSynced: false });
        return;
      }

      let lines: LyricLine[] = [];
      let isSynced = false;

      if (data.syncedLyrics && data.syncedLyrics.trim().length > 0) {
        lines = parseLrcLyrics(data.syncedLyrics);
        isSynced = lines.length > 0;
      } else if (data.plainLyrics && data.plainLyrics.trim().length > 0) {
        lines = parsePlainLyrics(data.plainLyrics);
        isSynced = false;
      }

      const paced = isSynced ? expandAndPaceLyrics(lines, 18, durationMs || 240000) : [];

      set({
        lyrics: data,
        parsedLines: lines,
        pacedLines: paced,
        isLoading: false,
        isSynced,
        activeLineIndex: lines.length > 0 ? 0 : -1,
        activePacedIndex: paced.length > 0 ? 0 : -1,
      });
    } catch (err) {
      console.warn('Failed to fetch lyrics:', err);
      set({ lyrics: null, parsedLines: [], pacedLines: [], isLoading: false, isSynced: false });
    }
  },

  updateProgress: (progressMs: number) => {
    const { parsedLines, pacedLines, isSynced, activeLineIndex, activePacedIndex } = get();
    if (!isSynced) return;

    // Update standard line index (for full view)
    if (parsedLines && parsedLines.length > 0) {
      let foundIndex = -1;
      for (let i = 0; i < parsedLines.length; i++) {
        if (parsedLines[i].timeMs <= progressMs) {
          foundIndex = i;
        } else {
          break;
        }
      }
      if (foundIndex !== activeLineIndex) {
        set({ activeLineIndex: foundIndex });
      }
    }

    // Update micro-paced line index (for micro-displays & ESP32 stream)
    if (pacedLines && pacedLines.length > 0) {
      let foundPacedIndex = -1;
      for (let p = 0; p < pacedLines.length; p++) {
        if (pacedLines[p].timeMs <= progressMs) {
          foundPacedIndex = p;
        } else {
          break;
        }
      }
      if (foundPacedIndex !== activePacedIndex) {
        set({ activePacedIndex: foundPacedIndex });
      }
    }
  },

  setManualOffsetMs: (offset: number) => {
    set({ manualOffsetMs: offset });
    const trackId = get().currentTrackId;
    if (trackId) {
      try {
        if (offset === 0) {
          localStorage.removeItem(`dc_lyric_offset_${trackId}`);
        } else {
          localStorage.setItem(`dc_lyric_offset_${trackId}`, String(offset));
        }
      } catch {
        // Ignore localStorage errors
      }
    }
  },

  adjustManualOffsetMs: (delta: number) => {
    const current = get().manualOffsetMs;
    get().setManualOffsetMs(current + delta);
  },

  reset: () => {
    set({
      lyrics: null,
      parsedLines: [],
      pacedLines: [],
      isLoading: false,
      currentTrackId: null,
      activeLineIndex: -1,
      activePacedIndex: -1,
      isSynced: false,
      manualOffsetMs: 0,
    });
  },
}));
