import React, { useState } from 'react';
import { controlRouter } from '../../services/controlRouter';
import { Play, Pause, SkipBack, SkipForward, Loader2 } from 'lucide-react';

interface PlaybackControlsProps {
  isPlaying: boolean;
  disabled?: boolean;
}

export const PlaybackControls: React.FC<PlaybackControlsProps> = ({
  isPlaying,
  disabled = false,
}) => {
  const [isBusy, setIsBusy] = useState(false);

  const handleAction = async (action: () => Promise<void>) => {
    if (disabled || isBusy) return;
    try {
      setIsBusy(true);
      await action();
    } catch (err) {
      console.error('Playback action error:', err);
    } finally {
      setTimeout(() => setIsBusy(false), 200);
    }
  };

  return (
    <div className="flex items-center justify-center gap-6 my-2">
      {/* Previous Track */}
      <button
        onClick={() => handleAction(() => controlRouter.previousTrack())}
        disabled={disabled || isBusy}
        title="Previous Track"
        className="p-3 text-neutral-300 hover:text-white active:scale-95 disabled:opacity-40 transition-all rounded-full hover:bg-neutral-800/60"
      >
        <SkipBack className="w-6 h-6 fill-current" />
      </button>

      {/* Play / Pause Toggle */}
      <button
        onClick={() => handleAction(() => controlRouter.togglePlay())}
        disabled={disabled}
        title={isPlaying ? 'Pause' : 'Play'}
        className="p-4 bg-emerald-500 hover:bg-emerald-400 active:scale-95 disabled:bg-neutral-800 disabled:text-neutral-500 text-black rounded-full shadow-lg shadow-emerald-500/25 transition-all"
      >
        {isBusy ? (
          <Loader2 className="w-7 h-7 animate-spin" />
        ) : isPlaying ? (
          <Pause className="w-7 h-7 fill-current" />
        ) : (
          <Play className="w-7 h-7 fill-current translate-x-0.5" />
        )}
      </button>

      {/* Next Track */}
      <button
        onClick={() => handleAction(() => controlRouter.nextTrack())}
        disabled={disabled || isBusy}
        title="Next Track"
        className="p-3 text-neutral-300 hover:text-white active:scale-95 disabled:opacity-40 transition-all rounded-full hover:bg-neutral-800/60"
      >
        <SkipForward className="w-6 h-6 fill-current" />
      </button>
    </div>
  );
};
