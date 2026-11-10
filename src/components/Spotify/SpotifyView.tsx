import React, { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { controlRouter } from '../../services/controlRouter';
import { extractDominantColor } from '../../services/dominantColor';
import { tauriIpc } from '../../services/tauriIpc';
import { SyncedLyricsView } from '../Lyrics/SyncedLyricsView';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Laptop,
  Smartphone,
  Speaker,
  Radio,
  RefreshCw,
  CheckCircle2,
  Music2,
} from 'lucide-react';

interface SpotifyViewProps {
  onOpenLogin?: () => void;
}

export const SpotifyView: React.FC<SpotifyViewProps> = ({ onOpenLogin }) => {
  const { session } = useAuthStore();
  const {
    playbackState,
    devices,
    fetchDevices,
    optimisticTransferDevice,
    getSmoothProgressMs,
  } = usePlayerStore();

  const [dominantColor, setDominantColor] = useState('#10b981');
  const [localProgress, setLocalProgress] = useState(0);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [isRefreshingDevices, setIsRefreshingDevices] = useState(false);

  const track = playbackState?.track;
  const isPlaying = playbackState?.isPlaying ?? false;
  const duration = playbackState?.durationMs || 1000;
  const currentVolume = playbackState?.device?.volumePercent ?? 70;
  const activeDevice = playbackState?.device;

  // Initial fetch of Spotify devices
  useEffect(() => {
    if (session?.isAuthenticated) {
      fetchDevices();
    }
  }, [session?.isAuthenticated, fetchDevices]);

  // Extract Dominant Color for ambient lighting
  useEffect(() => {
    if (track?.albumArtUrl) {
      extractDominantColor(track.albumArtUrl).then((color) => {
        setDominantColor(color);
      });
    }
  }, [track?.albumArtUrl]);

  // High-frequency 60Hz smooth progress ticker
  useEffect(() => {
    if (!isPlaying || isScrubbing) return;

    const interval = setInterval(() => {
      setLocalProgress(getSmoothProgressMs());
    }, 60);

    return () => clearInterval(interval);
  }, [isPlaying, isScrubbing, getSmoothProgressMs]);

  // Sync progress on playback state update
  useEffect(() => {
    if (!isScrubbing) {
      setLocalProgress(playbackState?.progressMs || 0);
    }
  }, [playbackState?.progressMs, isScrubbing]);

  const handleRefreshDevices = async () => {
    setIsRefreshingDevices(true);
    await fetchDevices();
    setTimeout(() => setIsRefreshingDevices(false), 600);
  };

  const handleTransferDevice = async (deviceId: string) => {
    optimisticTransferDevice(deviceId);
    await tauriIpc.spotifyTransferPlayback(deviceId, true);
  };

  const handleSeekCommit = async (val: number) => {
    setIsScrubbing(false);
    await controlRouter.seek(val);
  };

  const formatTime = (ms: number) => {
    const totalSecs = Math.floor(ms / 1000);
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const getDeviceIcon = (deviceType?: string) => {
    const t = deviceType?.toLowerCase() || '';
    if (t.includes('phone') || t.includes('mobile')) return <Smartphone className="w-4 h-4" />;
    if (t.includes('speaker') || t.includes('audio')) return <Speaker className="w-4 h-4" />;
    return <Laptop className="w-4 h-4" />;
  };

  // If not authenticated, show sign-in prompt
  if (!session?.isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center p-8 bg-neutral-950">
        <div className="max-w-md w-full text-center space-y-5 p-8 bg-neutral-900/40 border border-neutral-800 rounded-3xl shadow-xl">
          <div className="p-3.5 bg-emerald-500/10 text-emerald-400 rounded-2xl w-14 h-14 mx-auto flex items-center justify-center">
            <Music2 className="w-7 h-7" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-xl font-bold tracking-tight text-neutral-100">Connect to Spotify</h2>
            <p className="text-xs text-neutral-400">
              Sign in with your Spotify account to sync now playing audio and transfer playback.
            </p>
          </div>
          <button
            onClick={onOpenLogin}
            className="w-full py-3 px-6 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-2xl text-xs transition-all shadow-lg shadow-emerald-500/20"
          >
            Sign In with Spotify
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950">
      {/* SECTION 1: CONNECT TO ACTIVE DEVICES HEADER */}
      <div className="px-8 py-3.5 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md shrink-0">
        <div className="flex items-center justify-between mb-2.5">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 text-emerald-400 rounded-xl">
              <Radio className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-neutral-100">Spotify Connect Devices</h3>
              <p className="text-[11px] text-neutral-400">
                Click any active Spotify device to switch playback
              </p>
            </div>
          </div>

          <button
            onClick={handleRefreshDevices}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-xs text-neutral-300 transition-colors"
            title="Scan for available Spotify devices"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshingDevices ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Scan Devices</span>
          </button>
        </div>

        {/* Horizontal Device Cards */}
        <div className="flex items-center gap-3 overflow-x-auto pb-1 scrollbar-none">
          {devices.length === 0 ? (
            <div className="text-xs text-neutral-500 py-1 font-mono">
              No devices detected. Open Spotify on your PC, phone, or browser to link.
            </div>
          ) : (
            devices.map((dev) => {
              const isCurrent = dev.id === activeDevice?.id || dev.isActive;
              return (
                <button
                  key={dev.id}
                  onClick={() => handleTransferDevice(dev.id)}
                  className={`flex items-center gap-3 px-4 py-2 rounded-2xl border transition-all text-left shrink-0 ${
                    isCurrent
                      ? 'bg-emerald-500/10 border-emerald-500/40 shadow-lg shadow-emerald-500/10'
                      : 'bg-neutral-900/60 border-neutral-800/80 hover:bg-neutral-850 hover:border-neutral-700'
                  }`}
                >
                  <div
                    className={`p-2 rounded-xl ${
                      isCurrent ? 'bg-emerald-500 text-black' : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {getDeviceIcon(dev.deviceType)}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-neutral-200 truncate max-w-[140px]">
                        {dev.name}
                      </span>
                      {isCurrent && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />}
                    </div>
                    <p className="text-[10px] text-neutral-400 font-mono">
                      {isCurrent ? 'Active Output' : `${dev.deviceType || 'Speaker'} • Transfer`}
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* SECTION 2: NOW PLAYING SHOWCASE (With Split-View Lyrics Always Visible) */}
      <div className="flex-1 overflow-y-auto p-6 flex flex-col lg:flex-row items-center justify-center gap-6">
        {track ? (
          <>
            {/* Now Playing Card */}
            <div className="bg-neutral-900/60 border border-neutral-800 rounded-3xl p-6 relative overflow-hidden shadow-2xl transition-all duration-300 flex flex-col lg:w-[410px] w-full shrink-0">
              {/* Ambient Background Glow */}
              <div
                className="absolute -top-24 -left-24 w-96 h-96 rounded-full opacity-25 blur-3xl pointer-events-none"
                style={{ backgroundColor: dominantColor }}
              />

              {/* Album Artwork */}
              <div className="relative group shrink-0 w-full flex justify-center mb-3">
                <img
                  src={track.albumArtUrl || '/placeholder.png'}
                  alt={track.name}
                  className="rounded-2xl object-cover shadow-2xl border border-neutral-750 transition-all w-52 h-52"
                />
                {isPlaying && (
                  <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/60 backdrop-blur-md border border-white/10 text-[10px] font-mono font-bold text-emerald-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    PLAYING
                  </div>
                )}
              </div>

              {/* Track Info & Controls */}
              <div className="flex-1 min-w-0 space-y-4 w-full">
                {/* Titles */}
                <div className="space-y-1">
                  <span className="text-[10px] font-mono uppercase tracking-wider text-neutral-500">
                    {track.albumName || 'Spotify Playback'}
                  </span>
                  <h1 className="text-xl md:text-2xl font-black text-neutral-100 truncate tracking-tight">
                    {track.name}
                  </h1>
                  <p className="text-xs font-semibold text-neutral-400 truncate">
                    {track.artists.join(', ')}
                  </p>
                </div>

                {/* Progress Scrubber */}
                <div className="space-y-1">
                  <div className="relative flex items-center">
                    <input
                      type="range"
                      min={0}
                      max={duration}
                      value={localProgress}
                      onMouseDown={() => setIsScrubbing(true)}
                      onTouchStart={() => setIsScrubbing(true)}
                      onChange={(e) => setLocalProgress(Number(e.target.value))}
                      onMouseUp={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
                      onTouchEnd={(e) => handleSeekCommit(Number((e.target as HTMLInputElement).value))}
                      style={{
                        background: `linear-gradient(to right, ${dominantColor} ${
                          duration > 0 ? (localProgress / duration) * 100 : 0
                        }%, #262626 ${duration > 0 ? (localProgress / duration) * 100 : 0}%)`,
                      }}
                      className="w-full h-2 rounded-full appearance-none cursor-pointer accent-emerald-400 hover:h-2.5 transition-all"
                    />
                  </div>
                  <div className="flex items-center justify-between text-xs font-mono text-neutral-500">
                    <span>{formatTime(localProgress)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>

                {/* Playback Transport Buttons */}
                <div className="flex items-center justify-between pt-1">
                  <div className="flex items-center gap-2.5">
                    <button
                      onClick={() => controlRouter.previousTrack()}
                      className="p-2.5 rounded-2xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 transition-colors"
                      title="Previous Track"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>

                    <button
                      onClick={() => controlRouter.togglePlay()}
                      className="p-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-all shadow-lg shadow-emerald-500/25 active:scale-95"
                      title={isPlaying ? 'Pause' : 'Play'}
                    >
                      {isPlaying ? (
                        <Pause className="w-5 h-5 fill-current" />
                      ) : (
                        <Play className="w-5 h-5 fill-current translate-x-0.5" />
                      )}
                    </button>

                    <button
                      onClick={() => controlRouter.nextTrack()}
                      className="p-2.5 rounded-2xl bg-neutral-800/80 hover:bg-neutral-800 text-neutral-200 border border-neutral-700 transition-colors"
                      title="Next Track"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Spotify Volume Slider */}
                <div className="flex items-center gap-3 pt-2.5 border-t border-neutral-800">
                  <button
                    onClick={() => controlRouter.setVolume(currentVolume === 0 ? 50 : 0)}
                    className="text-neutral-400 hover:text-white"
                  >
                    {currentVolume === 0 ? (
                      <VolumeX className="w-4 h-4" />
                    ) : (
                      <Volume2 className="w-4 h-4" />
                    )}
                  </button>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={currentVolume}
                    onChange={(e) => controlRouter.setVolume(Number(e.target.value))}
                    className="w-36 h-1.5 bg-neutral-800 rounded-lg appearance-none cursor-pointer accent-emerald-400"
                  />
                  <span className="text-xs font-mono text-neutral-400 min-w-[32px]">
                    {currentVolume}%
                  </span>
                </div>
              </div>
            </div>

            {/* Split-View Lyrics Panel - Always Visible Alongside */}
            <div className="flex-1 h-full min-h-[460px] max-h-[580px] w-full max-w-2xl bg-neutral-900/60 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col">
              <SyncedLyricsView />
            </div>
          </>
        ) : (
          /* Standby State when Spotify is idle */
          <div className="max-w-md w-full text-center space-y-5 p-12 bg-neutral-900/40 border border-neutral-800 rounded-3xl">
            <div className="p-4 bg-emerald-500/10 text-emerald-400 rounded-3xl w-16 h-16 mx-auto flex items-center justify-center">
              <Music2 className="w-8 h-8" />
            </div>
            <div className="space-y-1.5">
              <h3 className="text-lg font-bold text-neutral-100">No Active Spotify Playback</h3>
              <p className="text-xs text-neutral-400 leading-relaxed">
                Open Spotify on your computer or phone and start any track, or select an active
                device from the top bar to connect.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
