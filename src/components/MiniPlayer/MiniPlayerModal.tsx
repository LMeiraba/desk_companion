import React, { useEffect, useState } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useLyricsStore } from '../../stores/useLyricsStore';
import { controlRouter } from '../../services/controlRouter';
import { extractDominantColor } from '../../services/dominantColor';
import { tauriIpc } from '../../services/tauriIpc';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Maximize2,
  Mic2,
} from 'lucide-react';

interface MiniPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MiniPlayerModal: React.FC<MiniPlayerModalProps> = ({ isOpen, onClose }) => {
  const { playbackState } = usePlayerStore();
  const { parsedLines, pacedLines, activeLineIndex, activePacedIndex, isSynced } = useLyricsStore();
  const [dominantColor, setDominantColor] = useState('#10b981');

  const track = playbackState?.track;
  const currentProgress = playbackState?.progressMs || 0;
  const duration = playbackState?.durationMs || 1000;
  const isPlaying = playbackState?.isPlaying || false;

  // Toggle true OS-level Always-on-Top and compact window size in Tauri
  useEffect(() => {
    if (isOpen) {
      tauriIpc.setMiniPlayerMode(true);
    } else {
      tauriIpc.setMiniPlayerMode(false);
    }
    return () => {
      tauriIpc.setMiniPlayerMode(false);
    };
  }, [isOpen]);

  const handleExpand = () => {
    tauriIpc.setMiniPlayerMode(false);
    onClose();
  };

  const stream = pacedLines && pacedLines.length > 0 ? pacedLines : parsedLines;
  const currentIdx = pacedLines && pacedLines.length > 0 ? activePacedIndex : activeLineIndex;

  const currentLyric =
    isSynced && currentIdx >= 0 && stream[currentIdx]
      ? stream[currentIdx].text
      : null;

  useEffect(() => {
    if (track?.albumArtUrl) {
      extractDominantColor(track.albumArtUrl).then(setDominantColor);
    }
  }, [track?.albumArtUrl]);

  if (!isOpen) return null;

  const progressPct = duration > 0 ? (currentProgress / duration) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 bg-neutral-950 select-none animate-in fade-in">
      <div
        className="w-full h-full rounded-2xl bg-neutral-900/90 border border-neutral-800 p-3 shadow-2xl relative flex flex-col justify-between overflow-hidden"
        style={{
          boxShadow: `0 0 25px -5px ${dominantColor}30`,
        }}
      >
        {/* Top Header / Expand Button */}
        <div className="flex items-center justify-between pb-1 mb-1 border-b border-neutral-850">
          <div className="flex items-center gap-2 min-w-0 pr-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span className="text-[10px] font-mono font-bold text-neutral-300 truncate">
              {track?.name || 'Mini Player'}
            </span>
          </div>
          <button
            onClick={handleExpand}
            className="p-1 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
            title="Expand Full Companion App"
          >
            <Maximize2 className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* 1-Line Live Synced Lyric */}
        <div className="my-1 px-2.5 py-1 rounded-xl bg-neutral-950/80 border border-neutral-850 flex items-center gap-2">
          <Mic2 className="w-3 h-3 text-emerald-400 shrink-0" />
          <p
            className="text-xs font-semibold truncate transition-colors"
            style={{ color: currentLyric ? dominantColor : '#737373' }}
          >
            {currentLyric || (isSynced ? '♪ Instrumental ♪' : track?.artists?.join(', ') || 'Idle')}
          </p>
        </div>

        {/* Timeline Scrubber */}
        <div className="space-y-0.5">
          <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${progressPct}%`,
                backgroundColor: dominantColor,
              }}
            />
          </div>
        </div>

        {/* Bottom Playback Controls */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[10px] font-mono text-neutral-500">
            {Math.floor(currentProgress / 60000)}:{String(Math.floor((currentProgress % 60000) / 1000)).padStart(2, '0')}
          </span>

          <div className="flex items-center gap-3">
            <button
              onClick={() => controlRouter.previousTrack()}
              className="p-1.5 text-neutral-400 hover:text-white transition-colors"
              title="Previous Track"
            >
              <SkipBack className="w-3.5 h-3.5 fill-current" />
            </button>

            <button
              onClick={() => controlRouter.togglePlay()}
              className="p-2 bg-white hover:bg-neutral-200 text-black rounded-full shadow-md transition-transform active:scale-95"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-3.5 h-3.5 fill-black" /> : <Play className="w-3.5 h-3.5 fill-black translate-x-0.5" />}
            </button>

            <button
              onClick={() => controlRouter.nextTrack()}
              className="p-1.5 text-neutral-400 hover:text-white transition-colors"
              title="Next Track"
            >
              <SkipForward className="w-3.5 h-3.5 fill-current" />
            </button>
          </div>

          <span className="text-[10px] font-mono text-neutral-500">
            {Math.floor(duration / 60000)}:{String(Math.floor((duration % 60000) / 1000)).padStart(2, '0')}
          </span>
        </div>
      </div>
    </div>
  );
};

