import React, { useState } from 'react';
import { controlRouter } from '../../services/controlRouter';
import { Volume, Volume1, Volume2, VolumeX } from 'lucide-react';

interface VolumeSliderProps {
  initialVolume?: number;
}

export const VolumeSlider: React.FC<VolumeSliderProps> = ({ initialVolume = 80 }) => {
  const [volume, setVolume] = useState(initialVolume);
  const [lastVolume, setLastVolume] = useState(initialVolume);

  const handleVolumeChange = async (newVal: number) => {
    setVolume(newVal);
    await controlRouter.setVolume(newVal);
  };

  const toggleMute = async () => {
    if (volume > 0) {
      setLastVolume(volume);
      await handleVolumeChange(0);
    } else {
      await handleVolumeChange(lastVolume || 80);
    }
  };

  const getVolumeIcon = () => {
    if (volume === 0) return <VolumeX className="w-4 h-4 text-neutral-400" />;
    if (volume < 30) return <Volume className="w-4 h-4 text-neutral-400" />;
    if (volume < 70) return <Volume1 className="w-4 h-4 text-neutral-400" />;
    return <Volume2 className="w-4 h-4 text-neutral-400" />;
  };

  return (
    <div className="flex items-center gap-2.5 max-w-xs mx-auto px-4 text-neutral-400">
      <button
        onClick={toggleMute}
        className="hover:text-white transition-colors p-1 rounded"
        title={volume === 0 ? 'Unmute' : 'Mute'}
      >
        {getVolumeIcon()}
      </button>

      <input
        type="range"
        min={0}
        max={100}
        value={volume}
        onChange={(e) => handleVolumeChange(Number(e.target.value))}
        style={{
          background: `linear-gradient(to right, #10b981 ${volume}%, #262626 ${volume}%)`,
        }}
        className="w-full h-1.5 rounded-lg appearance-none cursor-pointer accent-emerald-500 hover:h-2 transition-all"
      />

      <span className="text-xs font-mono w-7 text-right select-none">{volume}%</span>
    </div>
  );
};
