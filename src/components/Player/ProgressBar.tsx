import React, { useEffect, useState } from 'react';
import { controlRouter } from '../../services/controlRouter';

interface ProgressBarProps {
  progressMs: number;
  durationMs: number;
  isPlaying: boolean;
}

function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const ProgressBar: React.FC<ProgressBarProps> = ({
  progressMs,
  durationMs,
  isPlaying,
}) => {
  const [localProgress, setLocalProgress] = useState(progressMs);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [scrubValue, setScrubValue] = useState(progressMs);

  // Sync state when new progress arrives from SDK or poller
  useEffect(() => {
    if (!isScrubbing) {
      setLocalProgress(progressMs);
    }
  }, [progressMs, isScrubbing]);

  // Smooth local second-by-second interpolation when playing
  useEffect(() => {
    if (!isPlaying || isScrubbing || durationMs === 0) return;

    const interval = setInterval(() => {
      setLocalProgress((prev) => Math.min(durationMs, prev + 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, isScrubbing, durationMs]);

  const currentDisplay = isScrubbing ? scrubValue : localProgress;
  const progressPct = durationMs > 0 ? Math.min(100, Math.max(0, (currentDisplay / durationMs) * 100)) : 0;

  const handleSeekCommit = async () => {
    setIsScrubbing(false);
    setLocalProgress(scrubValue);
    await controlRouter.seek(scrubValue);
  };

  return (
    <div className="w-full max-w-lg mx-auto space-y-1.5 px-4">
      <div className="relative group flex items-center h-4 cursor-pointer">
        <input
          type="range"
          min={0}
          max={durationMs || 100}
          value={currentDisplay}
          onMouseDown={() => setIsScrubbing(true)}
          onTouchStart={() => setIsScrubbing(true)}
          onChange={(e) => setScrubValue(Number(e.target.value))}
          onMouseUp={handleSeekCommit}
          onTouchEnd={handleSeekCommit}
          style={{
            background: `linear-gradient(to right, #10b981 ${progressPct}%, #262626 ${progressPct}%)`,
          }}
          className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:h-2 transition-all"
        />
      </div>

      <div className="flex justify-between text-xs text-neutral-400 font-mono select-none px-0.5">
        <span>{formatTime(currentDisplay)}</span>
        <span>{formatTime(durationMs)}</span>
      </div>
    </div>
  );
};
