import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Volume2,
  VolumeX,
  Sun,
  Sliders,
  Play,
  Pause,
  SkipForward,
  SkipBack,
  RefreshCw,
} from 'lucide-react';
import { useWindowsControlStore } from '../../stores/useWindowsControlStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { tauriIpc } from '../../services/tauriIpc';

export const WindowsControlView: React.FC = () => {
  const {
    masterVolume,
    isMuted,
    setMasterVolume,
    toggleMute,
    monitorBrightness,
    setMonitorBrightness,
  } = useWindowsControlStore();

  const { playbackState } = usePlayerStore();
  const isPlaying = playbackState?.isPlaying ?? false;
  const [isRefreshing, setIsRefreshing] = useState(false);
  const volumeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const brightnessDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isInteractingVolume = useRef(false);
  const isInteractingBrightness = useRef(false);

  // Synchronize master volume & monitor brightness directly from Windows WASAPI
  const syncWindowsState = useCallback(async () => {
    try {
      if (!isInteractingVolume.current) {
        const vol = await tauriIpc.windowsGetVolume();
        if (typeof vol === 'number' && !isNaN(vol)) {
          setMasterVolume(vol);
        }
      }

      if (!isInteractingBrightness.current) {
        const b = await tauriIpc.windowsGetBrightness();
        if (typeof b === 'number' && b > 0) {
          setMonitorBrightness(b);
        }
      }
    } catch (err) {
      console.warn('[WindowsControl] Sync warning:', err);
    }
  }, [setMasterVolume, setMonitorBrightness]);

  // Initial sync + Active 1s polling interval while tab is open
  useEffect(() => {
    syncWindowsState();

    const interval = setInterval(() => {
      syncWindowsState();
    }, 1000);

    const handleFocus = () => {
      syncWindowsState();
    };
    window.addEventListener('focus', handleFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', handleFocus);
    };
  }, [syncWindowsState]);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await syncWindowsState();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  const handleToggleMute = async () => {
    await tauriIpc.windowsToggleMute();
    toggleMute();
  };

  const handleVolumeStep = async (delta: number) => {
    const nextVol = Math.max(0, Math.min(100, masterVolume + delta * 4));
    setMasterVolume(nextVol);
    await tauriIpc.windowsSetVolume(nextVol);
  };

  const handleVolumeSliderChange = (newVal: number) => {
    isInteractingVolume.current = true;
    setMasterVolume(newVal);
    if (volumeDebounceRef.current) clearTimeout(volumeDebounceRef.current);
    volumeDebounceRef.current = setTimeout(async () => {
      await tauriIpc.windowsSetVolume(newVal);
      isInteractingVolume.current = false;
    }, 40);
  };

  const handleBrightnessChange = (val: number) => {
    isInteractingBrightness.current = true;
    setMonitorBrightness(val);
    if (brightnessDebounceRef.current) clearTimeout(brightnessDebounceRef.current);
    brightnessDebounceRef.current = setTimeout(async () => {
      await tauriIpc.windowsSetBrightness(val);
      isInteractingBrightness.current = false;
    }, 60);
  };

  const handleGlobalMediaPlayPause = async () => {
    await tauriIpc.windowsMediaPlayPause();
  };

  const handleGlobalMediaNext = async () => {
    await tauriIpc.windowsMediaNext();
  };

  const handleGlobalMediaPrev = async () => {
    await tauriIpc.windowsMediaPrevious();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950">
      {/* Top Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 rounded-2xl">
            <Sliders className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base tracking-tight text-neutral-100">
              Windows Control Center
            </h2>
            <p className="text-xs text-neutral-400">
              Live WASAPI master audio & VESA DDC/CI monitor hardware brightness
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleManualRefresh}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-xs text-neutral-300 transition-colors"
            title="Poll current Windows audio & display levels"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Sync Levels</span>
          </button>
          <span className="px-2.5 py-1 rounded-full text-[11px] font-mono font-bold bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            WASAPI Live
          </span>
        </div>
      </div>

      {/* Main Controls Grid */}
      <div className="flex-1 overflow-y-auto p-8 space-y-6 max-w-4xl mx-auto w-full">
        {/* CARD 1: MASTER AUDIO & MEDIA KEYS */}
        <div className="p-6 rounded-3xl bg-neutral-900/60 border border-neutral-800 space-y-6 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <button
                onClick={handleToggleMute}
                className={`p-3.5 rounded-2xl border transition-all ${
                  isMuted
                    ? 'bg-rose-500/10 border-rose-500/30 text-rose-400 shadow-md shadow-rose-500/10'
                    : 'bg-neutral-800/80 border-neutral-700 text-neutral-200 hover:text-white'
                }`}
                title={isMuted ? 'Click to Unmute' : 'Click to Mute'}
              >
                {isMuted ? <VolumeX className="w-6 h-6" /> : <Volume2 className="w-6 h-6 text-cyan-400" />}
              </button>
              <div>
                <h3 className="text-base font-bold text-neutral-100">Windows Master Volume</h3>
                <p className="text-xs text-neutral-400">
                  {isMuted ? 'Muted' : `${masterVolume}% Level`} • System Default Audio Endpoint
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1 bg-neutral-950 p-1 rounded-xl border border-neutral-800">
                <button
                  onClick={() => handleVolumeStep(-1)}
                  className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 rounded-lg text-xs font-bold transition-colors"
                  title="Volume -4%"
                >
                  −
                </button>
                <button
                  onClick={() => handleVolumeStep(1)}
                  className="px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 text-neutral-200 rounded-lg text-xs font-bold transition-colors"
                  title="Volume +4%"
                >
                  +
                </button>
              </div>
              <span className="text-3xl font-black font-mono text-cyan-400 min-w-[75px] text-right">
                {isMuted ? '0%' : `${masterVolume}%`}
              </span>
            </div>
          </div>

          {/* Volume Slider */}
          <div className="space-y-1.5">
            <input
              type="range"
              min={0}
              max={100}
              value={isMuted ? 0 : masterVolume}
              onChange={(e) => handleVolumeSliderChange(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #06b6d4 ${isMuted ? 0 : masterVolume}%, #262626 ${isMuted ? 0 : masterVolume}%)`,
              }}
              className="w-full h-2.5 rounded-lg appearance-none cursor-pointer accent-cyan-400 hover:h-3 transition-all"
            />
            <div className="flex justify-between text-[10px] font-mono text-neutral-500">
              <span>0% (Silent)</span>
              <span>50%</span>
              <span>100% (Full Output)</span>
            </div>
          </div>

          {/* Global Media Transport Keys */}
          <div className="pt-4 border-t border-neutral-850 flex items-center justify-between">
            <div>
              <span className="text-xs text-neutral-300 font-semibold">Global Windows Media Keys</span>
              <p className="text-[11px] text-neutral-500">Sends hardware media key events to Windows audio session</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleGlobalMediaPrev}
                className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 transition-colors"
                title="Previous Track (Global Media Key)"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={handleGlobalMediaPlayPause}
                className="px-4 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-black font-bold text-xs flex items-center gap-2 transition-colors shadow-lg shadow-cyan-500/20"
                title="Play / Pause (Global Media Key)"
              >
                {isPlaying ? <Pause className="w-4 h-4 fill-black" /> : <Play className="w-4 h-4 fill-black" />}
                <span>{isPlaying ? 'Pause' : 'Play'}</span>
              </button>
              <button
                onClick={handleGlobalMediaNext}
                className="p-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-750 text-neutral-200 border border-neutral-700 transition-colors"
                title="Next Track (Global Media Key)"
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* CARD 2: MONITOR HARDWARE BRIGHTNESS */}
        <div className="p-6 rounded-3xl bg-neutral-900/60 border border-neutral-800 space-y-5 shadow-xl">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                <Sun className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-neutral-100">Monitor Hardware Brightness</h3>
                <p className="text-xs text-neutral-400">Direct VESA DDC/CI monitor panel backlight control</p>
              </div>
            </div>
            <span className="text-2xl font-black font-mono text-amber-400">{monitorBrightness}%</span>
          </div>

          <div className="space-y-1.5">
            <input
              type="range"
              min={0}
              max={100}
              value={monitorBrightness}
              onChange={(e) => handleBrightnessChange(Number(e.target.value))}
              style={{
                background: `linear-gradient(to right, #f59e0b ${monitorBrightness}%, #262626 ${monitorBrightness}%)`,
              }}
              className="w-full h-2.5 rounded-lg appearance-none cursor-pointer accent-amber-400 hover:h-3 transition-all"
            />
            <div className="flex justify-between text-[10px] font-mono text-neutral-500">
              <span>0% (Min Backlight)</span>
              <span>50%</span>
              <span>100% (Max Brightness)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
