import React, { useState, useEffect } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { controlRouter } from '../../services/controlRouter';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Cast,
  Mic2,
  Minimize2,
} from 'lucide-react';

interface PersistentPlayerBarProps {
  onOpenDevicePicker: () => void;
  isLyricsOpen?: boolean;
  onToggleLyrics?: () => void;
  onToggleMiniPlayer?: () => void;
}

export const PersistentPlayerBar: React.FC<PersistentPlayerBarProps> = ({
  onOpenDevicePicker,
  isLyricsOpen,
  onToggleLyrics,
  onToggleMiniPlayer,
}) => {
  const { playbackState, activeDeviceId, devices } = usePlayerStore();
  const [localProgress, setLocalProgress] = useState(playbackState?.progressMs || 0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(0);

  const activeDevice = devices.find((d) => d.id === activeDeviceId) || playbackState?.device;
  const currentVolume = playbackState?.device?.volumePercent ?? 80;

  // Smooth local timer progress increment when playing (paused while dragging)
  useEffect(() => {
    if (isScrubbing) return;
    if (!playbackState) return;
    setLocalProgress(playbackState.progressMs);

    if (!playbackState.isPlaying) return;

    const interval = setInterval(() => {
      setLocalProgress(usePlayerStore.getState().getSmoothProgressMs());
    }, 250);

    return () => clearInterval(interval);
  }, [playbackState?.progressMs, playbackState?.isPlaying, playbackState?.timestamp, isScrubbing]);

  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${String(secs).padStart(2, '0')}`;
  };

  const rawDuration = playbackState?.durationMs || 0;
  const isLiveOrUnknown = rawDuration <= 1000;
  const duration = isLiveOrUnknown ? 1000 : rawDuration;
  const currentDisplay = isScrubbing ? scrubValue : localProgress;

  const handleSeekMouseDown = (e: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    if (isLiveOrUnknown) return;
    setIsScrubbing(true);
    const targetVal = Number((e.target as HTMLInputElement).value);
    setScrubValue(isNaN(targetVal) ? localProgress : targetVal);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isLiveOrUnknown) return;
    setScrubValue(Number(e.target.value));
  };

  const handleSeekCommit = async (e?: React.MouseEvent<HTMLInputElement> | React.TouchEvent<HTMLInputElement>) => {
    if (isLiveOrUnknown) return;
    const targetVal = e ? Number((e.target as HTMLInputElement).value) : scrubValue;
    const targetMs = !isNaN(targetVal) ? targetVal : scrubValue;
    setIsScrubbing(false);
    setLocalProgress(targetMs);
    await controlRouter.seek(targetMs);
  };

  const handleVolumeChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = Number(e.target.value);
    await controlRouter.setVolume(val);
  };

  if (!playbackState?.track) {
    return (
      <footer className="h-20 bg-neutral-950/95 border-t border-neutral-900 px-6 flex items-center justify-between text-neutral-500 text-xs font-mono select-none flex-shrink-0">
        <span>No track currently playing</span>
        <button
          onClick={onOpenDevicePicker}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-850 text-neutral-300 border border-neutral-800 transition-colors"
        >
          <Cast className="w-3.5 h-3.5 text-emerald-400" />
          <span>{activeDevice?.name || 'Select Connect Target'}</span>
        </button>
      </footer>
    );
  }

  return (
    <footer className="h-22 bg-neutral-950/95 backdrop-blur-xl border-t border-neutral-850 px-6 flex items-center justify-between z-30 select-none flex-shrink-0 shadow-2xl">
      {/* LEFT SECTION: Track details & Audio quality */}
      <div className="flex items-center gap-3.5 min-w-0 w-1/4">
        <div className="relative group shrink-0">
          <img
            src={playbackState.track.albumArtUrl || '/placeholder.png'}
            alt={playbackState.track.name}
            className="w-13 h-13 rounded-2xl object-cover shadow-lg border border-neutral-800"
          />
          {playbackState.isPlaying && (
            <div className="absolute inset-0 bg-emerald-500/20 rounded-2xl animate-pulse" />
          )}
        </div>

        <div className="min-w-0">
          <p className="font-bold text-sm text-neutral-100 truncate hover:text-emerald-400 transition-colors">
            {playbackState.track.name}
          </p>
          <p className="text-xs text-neutral-400 truncate">
            {playbackState.track.artists.join(', ')}
          </p>
        </div>
      </div>

      {/* CENTER SECTION: Transport Controls & Scrubber */}
      <div className="flex flex-col items-center justify-center max-w-xl w-2/4 px-4 space-y-1.5">
        {/* Buttons */}
        <div className="flex items-center gap-5">
          <button
            onClick={() => controlRouter.previousTrack()}
            className="p-2 text-neutral-400 hover:text-white transition-all active:scale-95"
            title="Previous Track"
          >
            <SkipBack className="w-4 h-4 fill-current" />
          </button>

          <button
            onClick={() => controlRouter.togglePlay()}
            className="p-3 bg-white hover:bg-neutral-200 active:scale-95 text-black rounded-full shadow-lg transition-all"
            title={playbackState.isPlaying ? 'Pause' : 'Play'}
          >
            {playbackState.isPlaying ? (
              <Pause className="w-4 h-4 fill-black" />
            ) : (
              <Play className="w-4 h-4 fill-black translate-x-0.5" />
            )}
          </button>

          <button
            onClick={() => controlRouter.nextTrack()}
            className="p-2 text-neutral-400 hover:text-white transition-all active:scale-95"
            title="Next Track"
          >
            <SkipForward className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* Timeline Scrubber */}
        <div className="flex items-center gap-3 w-full font-mono text-[11px] text-neutral-400">
          <span className="w-10 text-right">{isLiveOrUnknown && currentDisplay === 0 ? '0:00' : formatTime(currentDisplay)}</span>

          <div className="relative flex-1 flex items-center group py-1">
            <input
              type="range"
              min={0}
              max={duration}
              value={isLiveOrUnknown ? duration : currentDisplay}
              disabled={isLiveOrUnknown}
              onMouseDown={handleSeekMouseDown}
              onTouchStart={handleSeekMouseDown}
              onChange={handleSeekChange}
              onMouseUp={handleSeekCommit}
              onTouchEnd={handleSeekCommit}
              style={{
                background: isLiveOrUnknown
                  ? 'linear-gradient(90deg, #10b981 0%, #059669 50%, #10b981 100%)'
                  : `linear-gradient(to right, #10b981 ${duration > 0 ? (currentDisplay / duration) * 100 : 0}%, #262626 ${duration > 0 ? (currentDisplay / duration) * 100 : 0}%)`,
              }}
              className={`w-full h-1.5 rounded-full appearance-none transition-all ${
                isLiveOrUnknown
                  ? 'cursor-default opacity-80 animate-pulse'
                  : 'cursor-pointer accent-emerald-400 hover:h-2'
              }`}
            />
          </div>

          <span className="w-10 text-left">
            {isLiveOrUnknown ? (
              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[9px] font-bold">LIVE</span>
            ) : (
              formatTime(duration)
            )}
          </span>
        </div>
      </div>

      {/* RIGHT SECTION: Device picker popover & Volume slider */}
      <div className="flex items-center justify-end gap-2.5 w-1/4">
        {/* Mini-Player Button */}
        {onToggleMiniPlayer && (
          <button
            onClick={onToggleMiniPlayer}
            className="p-2 rounded-xl bg-neutral-900 border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-750 transition-all"
            title="Open Mini Companion Player"
          >
            <Minimize2 className="w-4 h-4" />
          </button>
        )}

        {/* Synced Lyrics Button */}
        {onToggleLyrics && (
          <button
            onClick={onToggleLyrics}
            className={`p-2 rounded-xl border text-xs font-semibold transition-all ${
              isLyricsOpen
                ? 'bg-emerald-500 text-black border-transparent shadow-lg shadow-emerald-500/25'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-750'
            }`}
            title="Toggle Full Synced Lyrics"
          >
            <Mic2 className="w-4 h-4" />
          </button>
        )}

        {/* Active Device Button */}
        <button
          onClick={onOpenDevicePicker}
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-xs font-semibold text-neutral-300 hover:text-white transition-colors"
          title="Switch Output Device"
        >
          <Cast className="w-3.5 h-3.5 text-emerald-400" />
          <span className="max-w-[110px] truncate">{activeDevice?.name || 'Devices'}</span>
        </button>

        {/* Volume Slider */}
        <div className="flex items-center gap-2 group">
          {currentVolume === 0 ? (
            <VolumeX className="w-4 h-4 text-neutral-500" />
          ) : (
            <Volume2 className="w-4 h-4 text-neutral-400 group-hover:text-emerald-400 transition-colors" />
          )}

          <input
            type="range"
            min={0}
            max={100}
            value={currentVolume}
            onChange={handleVolumeChange}
            style={{
              background: `linear-gradient(to right, #10b981 ${currentVolume}%, #262626 ${currentVolume}%)`,
            }}
            className="w-20 h-1.5 rounded-full appearance-none cursor-pointer accent-emerald-400 hover:h-2 transition-all"
            title={`Volume: ${currentVolume}%`}
          />
        </div>
      </div>
    </footer>
  );
};
