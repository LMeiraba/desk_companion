import React, { useEffect, useRef, useState } from 'react';
import { useLyricsStore } from '../../stores/useLyricsStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { controlRouter } from '../../services/controlRouter';
import {
  Mic2,
  Sparkles,
  Music,
  Lock,
  Unlock,
  Radio,
  RefreshCw,
  X,
  RotateCcw,
} from 'lucide-react';

interface SyncedLyricsViewProps {
  className?: string;
  onClose?: () => void;
}

export const SyncedLyricsView: React.FC<SyncedLyricsViewProps> = ({ className = '', onClose }) => {
  const { playbackState } = usePlayerStore();
  const {
    lyrics,
    parsedLines,
    pacedLines,
    isLoading,
    activeLineIndex,
    activePacedIndex,
    isSynced,
    manualOffsetMs,
    adjustManualOffsetMs,
    setManualOffsetMs,
    fetchLyricsForTrack,
    updateProgress,
  } = useLyricsStore();

  const [isPacedMode, setIsPacedMode] = useState(true);
  const displayLines = isPacedMode && pacedLines && pacedLines.length > 0 ? pacedLines : parsedLines;
  const currentActiveIndex = isPacedMode && pacedLines && pacedLines.length > 0 ? activePacedIndex : activeLineIndex;

  const [autoScroll, setAutoScroll] = useState(true);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeLineRef = useRef<HTMLDivElement>(null);
  const userScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentTrack = playbackState?.track;

  // Immediate sync when view mounts
  useEffect(() => {
    const currentMs = usePlayerStore.getState().getSmoothProgressMs();
    updateProgress(currentMs + manualOffsetMs);
  }, [manualOffsetMs, updateProgress]);

  // Auto-scroll active line into view (smooth centered)
  useEffect(() => {
    if (autoScroll && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [currentActiveIndex, autoScroll]);

  // Handle user manual scroll: pause auto-scroll for 4.5 seconds
  const handleScroll = () => {
    if (userScrollTimeoutRef.current) {
      clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = setTimeout(() => {
      setAutoScroll(true);
    }, 4500);
  };

  const handleLineClick = async (timeMs: number) => {
    setAutoScroll(true);
    await controlRouter.seek(timeMs);
  };

  const handleRetryFetch = () => {
    if (currentTrack) {
      fetchLyricsForTrack(
        currentTrack.id,
        currentTrack.name,
        currentTrack.artists[0] || '',
        currentTrack.albumName,
        currentTrack.durationMs,
      );
    }
  };

  return (
    <div
      className={`flex flex-col h-full w-full bg-neutral-950/90 overflow-hidden relative select-none ${className}`}
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-neutral-850 bg-neutral-950/80 z-10">
        <div className="flex items-center gap-2.5 min-w-0 pr-2">
          <div className="p-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-xl shrink-0">
            <Mic2 className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-sm text-neutral-100 truncate">
              {currentTrack?.name || 'No Track'}
            </h3>
            <p className="text-xs text-neutral-400 truncate">
              {currentTrack?.artists.join(', ') || 'Unknown Artist'}
            </p>
          </div>
        </div>

        {/* Status Badges & Controls */}
        <div className="flex items-center gap-1.5 shrink-0">
          {isSynced && (
            <>
              {/* Nudge Sync Offset Buttons with Persistence */}
              <div
                className="flex items-center gap-1 text-[10px] font-mono text-neutral-400 bg-neutral-900 border border-neutral-800 rounded-xl px-1.5 py-0.5"
                title="Adjust and save timing offset for this song"
              >
                <button
                  onClick={() => adjustManualOffsetMs(-250)}
                  className="hover:text-emerald-400 px-1 font-bold transition-colors"
                  title="Delay Lyrics by 250ms"
                >
                  −
                </button>
                <span
                  className={`text-[9px] min-w-[34px] text-center font-bold ${
                    manualOffsetMs !== 0 ? 'text-emerald-400' : 'text-neutral-400'
                  }`}
                >
                  {manualOffsetMs === 0 ? 'SYNC' : `${manualOffsetMs > 0 ? '+' : ''}${manualOffsetMs}ms`}
                </span>
                <button
                  onClick={() => adjustManualOffsetMs(250)}
                  className="hover:text-emerald-400 px-1 font-bold transition-colors"
                  title="Advance Lyrics by 250ms"
                >
                  +
                </button>
                {manualOffsetMs !== 0 && (
                  <button
                    onClick={() => setManualOffsetMs(0)}
                    className="hover:text-red-400 pl-0.5 text-neutral-500 transition-colors"
                    title="Reset offset to 0"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>

              <span className="flex items-center gap-1.5 text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono font-bold">
                <Radio className="w-2.5 h-2.5 animate-pulse" />
                LRC
              </span>

              {/* Intelligent Sub-Chunk Pacing Toggle */}
              {isSynced && pacedLines.length > 0 && (
                <button
                  onClick={() => setIsPacedMode(!isPacedMode)}
                  className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full border font-mono font-bold transition-all ${
                    isPacedMode
                      ? 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400'
                      : 'bg-neutral-900 border-neutral-800 text-neutral-500 hover:text-neutral-300'
                  }`}
                  title={isPacedMode ? 'Intelligent Sub-Chunk Pacing Active' : 'Standard Full Verse Mode'}
                >
                  <span>{isPacedMode ? 'Split: ON' : 'Split: OFF'}</span>
                </button>
              )}
            </>
          )}

          {/* Auto-scroll toggle */}
          {isSynced && (
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`p-1.5 rounded-xl border text-xs font-semibold transition-all ${
                autoScroll
                  ? 'bg-neutral-900 border-neutral-800 text-emerald-400 hover:text-white'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-400'
              }`}
              title={autoScroll ? 'Auto-scroll Active' : 'Auto-scroll Paused'}
            >
              {autoScroll ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Refresh Lyrics */}
          <button
            onClick={handleRetryFetch}
            disabled={isLoading}
            className="p-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-400 hover:text-white transition-all"
            title="Refetch Lyrics"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          {/* Close Panel Button */}
          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-400 hover:text-white transition-all"
              title="Close Lyrics Panel"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main Lyrics Body */}
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto px-8 py-12 space-y-6 scroll-smooth text-center"
      >
        {isLoading ? (
          <div className="h-full flex flex-col items-center justify-center space-y-3 py-20 text-neutral-500">
            <Mic2 className="w-10 h-10 text-emerald-500/40 animate-pulse" />
            <p className="text-sm font-medium">Fetching synced lyrics from LRCLIB...</p>
          </div>
        ) : lyrics?.instrumental ? (
          <div className="h-full flex flex-col items-center justify-center space-y-4 py-20 text-neutral-400">
            <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-full">
              <Music className="w-10 h-10" />
            </div>
            <div className="space-y-1">
              <h4 className="text-lg font-bold text-neutral-200">Instrumental Track</h4>
              <p className="text-xs text-neutral-500">This song does not contain vocal lyrics.</p>
            </div>
          </div>
        ) : displayLines.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center space-y-4 py-20 text-neutral-500">
            <Sparkles className="w-10 h-10 text-neutral-600" />
            <div className="space-y-1">
              <h4 className="text-base font-bold text-neutral-300">No Lyrics Found</h4>
              <p className="text-xs text-neutral-500 max-w-xs mx-auto">
                Could not find synchronized lyrics for this song on LRCLIB.
              </p>
            </div>
            <button
              onClick={handleRetryFetch}
              className="px-4 py-2 bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 rounded-xl text-xs font-semibold text-neutral-300 transition-colors"
            >
              Retry Search
            </button>
          </div>
        ) : (
          displayLines.map((line, index) => {
            const isActive = isSynced && index === currentActiveIndex;
            const isPast = isSynced && index < currentActiveIndex;

            return (
              <div
                key={`${line.timeMs}-${index}`}
                ref={isActive ? activeLineRef : null}
                onClick={() => handleLineClick(line.timeMs)}
                className={`cursor-pointer transition-all duration-300 rounded-2xl px-4 py-2 group ${
                  isActive
                    ? 'text-white font-extrabold text-2xl scale-105 drop-shadow-[0_0_20px_rgba(16,185,129,0.35)]'
                    : isPast
                    ? 'text-neutral-500 font-semibold text-lg opacity-40 hover:opacity-80'
                    : 'text-neutral-400 font-semibold text-lg opacity-50 hover:opacity-90'
                }`}
              >
                <span className="inline-block transition-colors group-hover:text-emerald-400">
                  {line.text}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
