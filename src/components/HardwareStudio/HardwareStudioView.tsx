import React, { useState, useEffect, useRef } from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useLyricsStore } from '../../stores/useLyricsStore';
import { controlRouter } from '../../services/controlRouter';
import { extractDominantColor } from '../../services/dominantColor';
import { hardwareWs } from '../../services/hardwareWs';
import { tauriIpc } from '../../services/tauriIpc';
import { HotspotStatus } from '../../types/models';
import { useWindowsControlStore } from '../../stores/useWindowsControlStore';
import {
  RotateCw,
  RotateCcw,
  Volume2,
  VolumeX,
  FastForward,
  Layers,
  Wifi,
  WifiOff,
  Radio,
  Music2,
  Check,
  Settings,
  ExternalLink,
  X,
  Send,
  Play,
  Pause,
  Timer,
} from 'lucide-react';

export const HardwareStudioView: React.FC = () => {
  const { playbackState, deckScreen: activeScreen, setDeckScreen: setActiveScreen } = usePlayerStore();
  const { parsedLines, activeLineIndex, isSynced } = useLyricsStore();
  const { isBeatPulse } = useWindowsControlStore();

  const activeStream = parsedLines;
  const activeIndex = activeLineIndex;

  // Screen Modes: 'now_playing' | 'lyrics' | 'clock'
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);

  // Knob 1 Volume Mode: 'spotify' | 'system' | 'app'
  const [volumeMode, setVolumeMode] = useState<'spotify' | 'system' | 'app'>('spotify');
  const [modePopup, setModePopup] = useState<string | null>(null);

  // Orientation & Inversion settings persisted in localStorage
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(() => {
    return (localStorage.getItem('dc_deck_orientation') as 'portrait' | 'landscape') || 'portrait';
  });
  const [isFlipped, setIsFlipped] = useState(() => {
    return localStorage.getItem('dc_deck_flipped') === 'true';
  });
  const [isInverted, setIsInverted] = useState(() => {
    return localStorage.getItem('dc_deck_inverted') === 'true'; // default false for dark theme
  });

  const handleScreenChange = (screen: 'lyrics' | 'now_playing' | 'clock') => {
    setActiveScreen(screen);
    localStorage.setItem('dc_deck_screen', screen);
    if (hardwareWs.getIsConnected()) {
      hardwareWs.sendConfig({ type: 'set_screen', screen });
    }
  };

  const handleToggleInvert = () => {
    const nextInv = !isInverted;
    setIsInverted(nextInv);
    localStorage.setItem('dc_deck_inverted', String(nextInv));
    if (hardwareWs.getIsConnected()) {
      hardwareWs.sendConfig({ type: 'set_invert', invert: nextInv });
    }
    triggerModePopup(nextInv ? 'Colors: INVERTED (True)' : 'Colors: STANDARD (False)');
  };

  // Focus & Pomodoro Productivity State (Merged from Desk Dashboard)
  const [pomodoroSeconds, setPomodoroSeconds] = useState(25 * 60);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [timerMode, setTimerMode] = useState<'work' | 'break'>('work');
  const [liveClock, setLiveClock] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setLiveClock(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (isTimerRunning && pomodoroSeconds > 0) {
      interval = setInterval(() => {
        setPomodoroSeconds((prev) => prev - 1);
      }, 1000);
    } else if (pomodoroSeconds === 0) {
      setIsTimerRunning(false);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isTimerRunning, pomodoroSeconds]);

  const handleOrientationChange = (newOri: 'portrait' | 'landscape', flip = isFlipped) => {
    setOrientation(newOri);
    localStorage.setItem('dc_deck_orientation', newOri);
    const targetOri = flip ? `${newOri}_flipped` : newOri;
    if (hardwareWs.getIsConnected()) {
      hardwareWs.sendConfig({ type: 'set_orientation', orientation: targetOri });
    }
  };

  const handleToggleFlip = () => {
    const nextFlip = !isFlipped;
    setIsFlipped(nextFlip);
    localStorage.setItem('dc_deck_flipped', String(nextFlip));
    handleOrientationChange(orientation, nextFlip);
  };

  // Dynamic Accent Color
  const [dominantColor, setDominantColor] = useState('#10b981');

  // WebSocket / mDNS Connection
  const [mDnsAddress, setMDnsAddress] = useState(
    () => localStorage.getItem('hardware_esp32_address') || '10.26.152.127'
  );
  const [isConnected, setIsConnected] = useState(hardwareWs.getIsConnected());
  const [isConnecting, setIsConnecting] = useState(false);

  // Auto-migrate any stale 'desk-companion.local' to direct IP '10.26.152.127' to avoid WebView2 mDNS drops
  useEffect(() => {
    const saved = localStorage.getItem('hardware_esp32_address');
    if (!saved || saved === 'desk-companion.local') {
      localStorage.setItem('hardware_esp32_address', '10.26.152.127');
      setMDnsAddress('10.26.152.127');
    }
  }, []);

  // ESP32 Provisioning state
  const [wifiSsid, setWifiSsid] = useState('');
  const [wifiPass, setWifiPass] = useState('');
  const [provisionMessage, setProvisionMessage] = useState<string | null>(null);

  // PC Wi-Fi Direct Hotspot (Standalone 2.4 GHz SoftAP)
  const [hotspotStatus, setHotspotStatus] = useState<HotspotStatus>({
    isRunning: false,
    ssid: 'DeskCompanion-Host',
    password: '12345678',
    message: 'Stopped',
  });
  const [hotspotSsidInput, setHotspotSsidInput] = useState('DeskCompanion-Host');
  const [hotspotPassInput, setHotspotPassInput] = useState('12345678');
  const [isHotspotLoading, setIsHotspotLoading] = useState(false);
  const [hotspotFeedback, setHotspotFeedback] = useState<string | null>(null);

  // Sync initial Hotspot status on mount
  useEffect(() => {
    tauriIpc
      .hotspotGetStatus()
      .then((status) => {
        setHotspotStatus(status);
        if (status.ssid) setHotspotSsidInput(status.ssid);
        if (status.password) setHotspotPassInput(status.password);
      })
      .catch((err) => {
        console.warn('Failed to get initial hotspot status:', err);
      });
  }, []);

  const handleToggleHotspot = async () => {
    setIsHotspotLoading(true);
    setHotspotFeedback(null);
    try {
      if (hotspotStatus.isRunning) {
        const res = await tauriIpc.hotspotStop();
        setHotspotStatus(res);
        setHotspotFeedback('✓ Hotspot stopped');
      } else {
        const res = await tauriIpc.hotspotStart(hotspotSsidInput.trim(), hotspotPassInput.trim());
        setHotspotStatus(res);
        setHotspotFeedback(res.isRunning ? '✓ Hotspot active on 2.4 GHz' : res.message);
      }
    } catch (err: any) {
      setHotspotFeedback(`Error: ${err?.message || err}`);
    } finally {
      setIsHotspotLoading(false);
      setTimeout(() => setHotspotFeedback(null), 5000);
    }
  };

  // Knob Dial Angles for Visual Rotation
  const [dial1Angle, setDial1Angle] = useState(120);
  const [dial2Angle, setDial2Angle] = useState(45);
  const [dial3Angle, setDial3Angle] = useState(0);

  const doubleClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const winMedia = useWindowsControlStore((s) => s.windowsMedia);
  const isSpotifyPlaying = playbackState?.isPlaying ?? false;
  const useWinMedia = !isSpotifyPlaying && Boolean(winMedia?.isPlaying && winMedia?.title?.trim());

  const activeTrack = useWinMedia && winMedia
    ? {
        name: winMedia.title,
        artists: [winMedia.artist || winMedia.source.toUpperCase()],
        albumArtUrl: winMedia.albumArtUrl || '',
      }
    : playbackState?.track;

  const track = activeTrack;
  const currentProgress = playbackState?.progressMs || 0;
  const duration = playbackState?.durationMs || 1000;
  const volumePercent = playbackState?.device?.volumePercent ?? 50;

  // Extract Dominant Color on track change
  useEffect(() => {
    if (track?.albumArtUrl) {
      extractDominantColor(track.albumArtUrl).then((color) => {
        setDominantColor(color);
      });
    }
  }, [track?.albumArtUrl]);



  // Subscribe to WebSocket status
  useEffect(() => {
    const unsub = hardwareWs.subscribe(({ type, payload }) => {
      if (type === 'connection') {
        setIsConnected(payload.connected);
        setIsConnecting(false);
      }
    });
    return unsub;
  }, []);

  const handleConnectToggle = () => {
    if (isConnected) {
      hardwareWs.disconnect();
    } else {
      setIsConnecting(true);
      const target = mDnsAddress.trim();
      localStorage.setItem('hardware_esp32_address', target);
      hardwareWs.connect(target);
    }
  };

  // KNOB 1 ACTIONS: Media Volume & Mode Cycle
  const handleKnob1Rotate = async (delta: number) => {
    setDial1Angle((prev) => (prev + delta * 15) % 360);
    const step = delta * 5;

    if (volumeMode === 'spotify') {
      const nextVol = Math.max(0, Math.min(100, volumePercent + step));
      await controlRouter.setVolume(nextVol);
      triggerModePopup(`Spotify Vol: ${nextVol}%`);
    } else if (volumeMode === 'system') {
      // Adjust system volume representation
      const nextVol = Math.max(0, Math.min(100, volumePercent + step));
      triggerModePopup(`System Vol: ${nextVol}%`);
    } else {
      const nextVol = Math.max(0, Math.min(100, volumePercent + step));
      triggerModePopup(`App Vol: ${nextVol}%`);
    }
  };

  const knob1ClickTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleKnob1Click = () => {
    if (knob1ClickTimeoutRef.current) {
      // Double Click -> Cycle Volume Mode
      clearTimeout(knob1ClickTimeoutRef.current);
      knob1ClickTimeoutRef.current = null;
      const modes: ('spotify' | 'system' | 'app')[] = ['spotify', 'system', 'app'];
      const nextIndex = (modes.indexOf(volumeMode) + 1) % modes.length;
      const nextMode = modes[nextIndex];
      setVolumeMode(nextMode);
      controlRouter.setVolumeMode(nextMode);
      triggerModePopup(`Target: ${nextMode.toUpperCase()}`);
    } else {
      // Single Click -> Toggle Mute
      knob1ClickTimeoutRef.current = setTimeout(async () => {
        knob1ClickTimeoutRef.current = null;
        await controlRouter.toggleMute();
        const curVol = usePlayerStore.getState().playbackState?.device?.volumePercent ?? 0;
        triggerModePopup(curVol === 0 ? 'Volume: MUTED' : `Volume: ${curVol}%`);
      }, 260);
    }
  };

  const handleCycleVolumeMode = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const modes: ('spotify' | 'system' | 'app')[] = ['spotify', 'system', 'app'];
    const nextIndex = (modes.indexOf(volumeMode) + 1) % modes.length;
    const nextMode = modes[nextIndex];
    setVolumeMode(nextMode);
    controlRouter.setVolumeMode(nextMode);
    triggerModePopup(`Target: ${nextMode.toUpperCase()}`);
  };

  // KNOB 2 ACTIONS: Seek & Skip (Single click = Next, Double click = Prev)
  const handleKnob2Rotate = async (delta: number) => {
    setDial2Angle((prev) => (prev + delta * 15) % 360);
    const seekMs = Math.max(0, Math.min(duration, currentProgress + delta * 5000));
    await controlRouter.seek(seekMs);
    triggerModePopup(`Seek: ${Math.floor(seekMs / 1000)}s`);
  };

  const handleKnob2Click = () => {
    if (doubleClickTimeoutRef.current) {
      // Double Click -> Previous Track
      clearTimeout(doubleClickTimeoutRef.current);
      doubleClickTimeoutRef.current = null;
      controlRouter.previousTrack();
      triggerModePopup('⏮ Previous Track');
    } else {
      // Wait to see if second click arrives, otherwise Next Track
      doubleClickTimeoutRef.current = setTimeout(() => {
        doubleClickTimeoutRef.current = null;
        controlRouter.nextTrack();
        triggerModePopup('⏭ Next Track');
      }, 280);
    }
  };

  // KNOB 3 ACTIONS: Screen Switcher & Menu Toggle
  const handleKnob3Rotate = (delta: number) => {
    setDial3Angle((prev) => (prev + delta * 25) % 360);
    const screens: ('lyrics' | 'now_playing' | 'clock')[] = ['lyrics', 'now_playing', 'clock'];
    const currentIndex = screens.indexOf(activeScreen);
    const nextIndex = (currentIndex + delta + screens.length) % screens.length;
    handleScreenChange(screens[nextIndex]);
    triggerModePopup(`Screen: ${screens[nextIndex].replace('_', ' ').toUpperCase()}`);
  };

  const handleKnob3Click = () => {
    setIsMenuOpen((prev) => !prev);
  };

  const triggerModePopup = (text: string) => {
    setModePopup(text);
    setTimeout(() => {
      setModePopup((current) => (current === text ? null : current));
    }, 1800);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950">
      {/* Top Option B Connection Bar */}
      <div className="flex items-center justify-between px-8 py-3.5 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
            <Radio className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-100">ESP32 Hardware Deck</h2>
            <p className="text-[11px] text-neutral-500 font-mono">
              2.8" SPI TFT (240×320 Portrait) • Option B WebSocket
            </p>
          </div>
        </div>

        {/* mDNS Input & Connect Button */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-mono">
            <span className="text-neutral-500 text-[11px]">mDNS / IP:</span>
            <input
              type="text"
              value={mDnsAddress}
              onChange={(e) => setMDnsAddress(e.target.value)}
              placeholder="desk-companion.local"
              className="bg-transparent text-neutral-200 focus:outline-none w-44 font-semibold text-xs"
            />
          </div>

          <button
            onClick={() => setIsSettingsModalOpen(true)}
            className="p-2 rounded-xl bg-neutral-900 hover:bg-neutral-850 border border-neutral-800 text-neutral-400 hover:text-white transition-colors"
            title="ESP32 Onboard Settings & Wi-Fi Provisioning"
          >
            <Settings className="w-4 h-4" />
          </button>

          <button
            onClick={handleConnectToggle}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all ${
              isConnected
                ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-rose-500/20 hover:text-rose-400 hover:border-rose-500/30'
                : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-lg shadow-emerald-500/20'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-3.5 h-3.5" />
                <span>Connected</span>
              </>
            ) : isConnecting ? (
              <span>Connecting...</span>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5" />
                <span>Connect ESP32</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Main Studio Area */}
      <div className="flex-1 overflow-y-auto p-8 flex flex-col lg:flex-row items-center justify-center gap-10">
        {/* TFT DISPLAY (Orientation & Screen Mode Toggleable) */}
        <div className="flex flex-col items-center">
          {/* Active Screen Switcher Mode (Lyrics | Now Playing | Desk Clock & Focus) */}
          <div className="flex items-center gap-1 p-1 bg-neutral-900 rounded-xl border border-neutral-800 mb-2 text-xs">
            <button
              onClick={() => handleScreenChange('lyrics')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
                activeScreen === 'lyrics'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <span>Lyrics View</span>
            </button>
            <button
              onClick={() => handleScreenChange('now_playing')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
                activeScreen === 'now_playing'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <span>Now Playing</span>
            </button>
            <button
              onClick={() => handleScreenChange('clock')}
              className={`px-3 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1.5 ${
                activeScreen === 'clock'
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <span>Desk Clock</span>
            </button>
          </div>

          {/* Orientation & Inversion Toggle Pills */}
          <div className="flex items-center gap-1 p-1 bg-neutral-900 rounded-xl border border-neutral-800 mb-3 text-xs">
            <button
              onClick={() => handleOrientationChange('portrait')}
              className={`px-3 py-1 rounded-lg font-semibold text-[11px] transition-all ${
                orientation === 'portrait'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Portrait (240×320)
            </button>
            <button
              onClick={() => handleOrientationChange('landscape')}
              className={`px-3 py-1 rounded-lg font-semibold text-[11px] transition-all ${
                orientation === 'landscape'
                  ? 'bg-neutral-800 text-white shadow-sm'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Landscape (320×240)
            </button>
            <button
              onClick={handleToggleFlip}
              title="Flip 180 degrees (improves TN viewing angle)"
              className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-all flex items-center gap-1 ${
                isFlipped
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <RotateCw className="w-3 h-3" />
              <span>{isFlipped ? '180° Inverted' : 'Flip 180°'}</span>
            </button>
            <button
              onClick={handleToggleInvert}
              title="Toggle hardware color polarity (fixes blue appearing as yellow)"
              className={`px-2.5 py-1 rounded-lg font-semibold text-[11px] transition-all flex items-center gap-1 ${
                isInverted
                  ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/30'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              <span>{isInverted ? 'Invert On' : 'Invert Off'}</span>
            </button>
          </div>

          <div
            className={`relative rounded-[28px] p-3.5 bg-black border shadow-2xl flex flex-col overflow-hidden select-none ${
              orientation === 'portrait' ? 'w-[270px] h-[360px]' : 'w-[360px] h-[270px]'
            }`}
            style={{
              borderColor: playbackState?.isPlaying
                ? isBeatPulse
                  ? dominantColor
                  : `${dominantColor}70`
                : '#262626',
              boxShadow: playbackState?.isPlaying
                ? `0 20px 45px -10px rgba(0,0,0,0.8), 0 0 ${isBeatPulse ? '42px' : '26px'} ${
                    isBeatPulse ? '2px' : '-6px'
                  } ${dominantColor}${isBeatPulse ? '75' : '35'}`
                : `0 20px 45px -10px rgba(0,0,0,0.8), 0 0 20px -10px ${dominantColor}20`,
              transform: isBeatPulse ? 'scale(1.008)' : 'scale(1)',
              transition: isBeatPulse ? 'all 80ms cubic-bezier(0.1, 0.9, 0.2, 1)' : 'all 320ms ease-out',
            }}
          >
            {/* Ambient Hardware-Calibrated Atmospheric Top Glow (Matches ESP32 drawAmbientTopGlow 75px) */}
            <div
              className="absolute top-0 left-0 right-0 h-[75px] pointer-events-none transition-all duration-700"
              style={{
                background: `linear-gradient(to bottom, ${dominantColor}30 0%, ${dominantColor}10 50%, transparent 100%)`,
              }}
            />

            {/* SCREEN CONTENT 1: SYNCED LYRICS (PORTRAIT) */}
            {activeScreen === 'lyrics' && (
              <div className="relative z-10 flex-1 flex flex-col justify-between py-1 px-1 text-center">
                {/* Mini Top Track Bar with Album Art */}
                <div className="flex items-center justify-between pb-2 border-b border-neutral-850">
                  <div className="flex items-center gap-2 min-w-0 pr-2">
                    {track?.albumArtUrl ? (
                      <img
                        src={track.albumArtUrl}
                        alt="Art"
                        className="w-8 h-8 rounded-lg object-cover border shrink-0"
                        style={{ borderColor: dominantColor }}
                      />
                    ) : (
                      <div className="w-8 h-8 rounded-lg bg-neutral-900 border border-neutral-850 flex items-center justify-center shrink-0">
                        <Music2 className="w-4 h-4" style={{ color: dominantColor }} />
                      </div>
                    )}
                    <div className="text-left min-w-0">
                      <p className="text-[11px] font-bold text-neutral-200 truncate">{track?.name || 'No Song'}</p>
                      <p className="text-[9px] text-neutral-400 truncate">{track?.artists?.[0] || 'Idle'}</p>
                    </div>
                  </div>
                  <span
                    className="text-[9px] px-1.5 py-0.5 rounded font-mono font-bold border shrink-0"
                    style={{
                      borderColor: dominantColor,
                      color: dominantColor,
                      backgroundColor: `${dominantColor}20`,
                    }}
                  >
                    LRC
                  </span>
                </div>

                {/* 3-Line Vertical Lyrics Scroller */}
                <div className="flex-1 flex flex-col justify-center space-y-3 py-2 overflow-hidden">
                  {/* Past line */}
                  <p className="text-[11px] text-neutral-500 truncate transition-all duration-300">
                    {activeIndex > 0 && activeStream[activeIndex - 1]?.text}
                  </p>

                  {/* Active Live Line */}
                  <div className="py-2 px-3 rounded-xl bg-neutral-900/60 border border-neutral-800">
                    <p
                      className="text-sm font-extrabold leading-snug tracking-tight drop-shadow-md transition-all duration-200"
                      style={{ color: dominantColor }}
                    >
                      {activeIndex >= 0 && activeStream[activeIndex]?.text
                        ? activeStream[activeIndex].text
                        : isSynced
                        ? '♪ Instrumental ♪'
                        : 'No Synced Lyrics'}
                    </p>
                  </div>

                  {/* Next line */}
                  <p className="text-[11px] text-neutral-500 truncate transition-all duration-300">
                    {activeIndex + 1 < activeStream.length && activeStream[activeIndex + 1]?.text}
                  </p>
                </div>

                {/* Bottom Progress Bar */}
                <div className="pt-2 border-t border-neutral-850">
                  <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden mb-1">
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{
                        width: `${duration > 0 ? (currentProgress / duration) * 100 : 0}%`,
                        backgroundColor: dominantColor,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] font-mono text-neutral-400">
                    <span>{Math.floor(currentProgress / 60000)}:{String(Math.floor((currentProgress % 60000) / 1000)).padStart(2, '0')}</span>
                    <span>{duration > 1000 ? `${Math.floor(duration / 60000)}:${String(Math.floor((duration % 60000) / 1000)).padStart(2, '0')}` : 'LIVE'}</span>
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN CONTENT 2: NOW PLAYING */}
            {activeScreen === 'now_playing' && (
              <div className="relative z-10 flex-1 flex flex-col items-center justify-between py-2 text-center">
                <div className="w-36 h-36 rounded-2xl overflow-hidden shadow-xl border border-neutral-800 mx-auto my-auto mt-2">
                  <img
                    src={track?.albumArtUrl || '/placeholder.png'}
                    alt={track?.name}
                    className="w-full h-full object-cover"
                  />
                </div>

                <div className="w-full px-2 mt-2">
                  <h4 className="text-xs font-extrabold text-neutral-100 truncate">{track?.name || 'No Track'}</h4>
                  <p className="text-[10px] text-neutral-400 truncate mt-0.5">{track?.artists?.join(', ')}</p>
                </div>

                <div className="w-full px-2 mt-3">
                  <div className="w-full h-1 bg-neutral-800 rounded-full overflow-hidden mb-1">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${duration > 0 ? (currentProgress / duration) * 100 : 0}%`,
                        backgroundColor: dominantColor,
                      }}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* SCREEN CONTENT 3: CLOCK & DESK STATUS */}
            {activeScreen === 'clock' && (
              <div className="relative z-10 flex-1 flex flex-col justify-between py-4 text-center">
                <div className="space-y-1 mt-6">
                  <h3 className="text-4xl font-extrabold font-mono tracking-tighter text-neutral-100">
                    {liveClock.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true }).toLowerCase()}
                  </h3>
                  <p className="text-[10px] uppercase font-mono tracking-wider text-neutral-500">
                    {liveClock.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }).toUpperCase()}
                  </p>
                </div>

                <div className="p-3 bg-neutral-900/80 rounded-2xl border border-neutral-800 text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <Music2 className="w-3 h-3 text-emerald-400" />
                    <span className="text-[10px] font-bold text-neutral-300 truncate">{track?.name || 'Idle'}</span>
                  </div>
                  <p className="text-[9px] text-neutral-500 truncate">{track?.artists?.join(', ')}</p>
                </div>
              </div>
            )}

            {/* Overlay Mode Feedback Badge (Triggered when knob is turned) */}
            {modePopup && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3 py-1 rounded-full bg-neutral-900/95 border border-neutral-700 shadow-xl text-[10px] font-mono font-bold text-emerald-400 animate-in fade-in zoom-in-95">
                {modePopup}
              </div>
            )}

            {/* Knob 3 On-Screen Switcher Menu Overlay */}
            {isMenuOpen && (
              <div className="absolute inset-0 z-20 bg-neutral-950/90 backdrop-blur-md flex flex-col justify-center p-4 space-y-2 animate-in fade-in">
                <p className="text-[10px] font-mono uppercase text-neutral-400 tracking-wider mb-1 text-center">
                  Select Screen (Knob 3)
                </p>
                {(['lyrics', 'now_playing', 'clock'] as const).map((scr) => (
                  <button
                    key={scr}
                    onClick={() => {
                      handleScreenChange(scr);
                      setIsMenuOpen(false);
                    }}
                    className={`flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all ${
                      activeScreen === scr
                        ? 'bg-emerald-500 text-black font-bold'
                        : 'bg-neutral-900 text-neutral-300 hover:bg-neutral-850'
                    }`}
                  >
                    <span className="capitalize">{scr.replace('_', ' ')}</span>
                    {activeScreen === scr && <Check className="w-3.5 h-3.5" />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 3 PHYSICAL ROTARY ENCODERS */}
        <div className="flex flex-col gap-5 w-full max-w-md">
          {/* KNOB 1: VOLUME & AUDIO TARGET */}
          <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full bg-neutral-950 border-2 border-neutral-700 flex items-center justify-center relative cursor-pointer active:scale-95 transition-transform shadow-inner"
                onClick={handleKnob1Click}
                title="1x Click: Mute/Unmute | 2x Click: Cycle Target (Spotify/System/App)"
              >
                <div
                  className="w-1.5 h-3 bg-emerald-400 rounded-full absolute top-1 transition-transform duration-100"
                  style={{ transform: `rotate(${dial1Angle}deg)` }}
                />
                {volumePercent === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-neutral-400" />
                )}
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-xs text-neutral-200">Knob 1: Volume & Target</h4>
                  <span
                    onClick={() => handleCycleVolumeMode()}
                    className={`cursor-pointer text-[9px] uppercase px-2 py-0.5 rounded font-mono font-bold border transition-colors ${
                      volumeMode === 'spotify'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : volumeMode === 'system'
                        ? 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30'
                        : 'bg-purple-500/20 text-purple-400 border-purple-500/30'
                    }`}
                    title="Click to cycle Audio Target Mode (Spotify / System / App)"
                  >
                    {volumeMode}
                  </span>
                  {volumePercent === 0 && (
                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded font-mono font-bold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      MUTED
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-neutral-500">Rotate: ±5% • 1x: Mute • 2x: Target Mode</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={async () => {
                  await controlRouter.toggleMute();
                  const curVol = usePlayerStore.getState().playbackState?.device?.volumePercent ?? 0;
                  triggerModePopup(curVol === 0 ? 'Volume: MUTED' : `Volume: ${curVol}%`);
                }}
                className="px-2 py-1.5 bg-neutral-850 hover:bg-neutral-800 rounded-xl text-[10px] font-bold text-neutral-300"
                title="Mute / Unmute Toggle"
              >
                Mute
              </button>
              <button
                onClick={() => handleCycleVolumeMode()}
                className="px-2 py-1.5 bg-neutral-850 hover:bg-neutral-800 rounded-xl text-[10px] font-bold text-neutral-300"
                title="Switch Audio Target Mode (Spotify -> System -> App)"
              >
                Target
              </button>
              <button
                onClick={() => handleKnob1Rotate(-1)}
                className="p-2 bg-neutral-850 hover:bg-neutral-800 rounded-xl text-neutral-300"
                title="Volume Down"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleKnob1Rotate(1)}
                className="p-2 bg-neutral-850 hover:bg-neutral-800 rounded-xl text-neutral-300"
                title="Volume Up"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* KNOB 2: SEEK & SKIP */}
          <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full bg-neutral-950 border-2 border-neutral-700 flex items-center justify-center relative cursor-pointer active:scale-95 transition-transform shadow-inner"
                onClick={handleKnob2Click}
                title="1x Click: Next | 2x Click: Prev"
              >
                <div
                  className="w-1.5 h-3 bg-cyan-400 rounded-full absolute top-1 transition-transform duration-100"
                  style={{ transform: `rotate(${dial2Angle}deg)` }}
                />
                <FastForward className="w-4 h-4 text-neutral-400" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-neutral-200">Knob 2: Seek & Playback</h4>
                <p className="text-[11px] text-neutral-500">Rotate: ±5s • 1x: Next • 2x: Prev • Hold: Play/Pause</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  controlRouter.previousTrack();
                  triggerModePopup('⏮ Previous Track');
                }}
                className="px-2 py-1.5 bg-neutral-850 hover:bg-neutral-800 rounded-xl text-[10px] font-bold text-neutral-300"
                title="Previous Track"
              >
                ⏮
              </button>
              <button
                onClick={() => {
                  controlRouter.togglePlay();
                  triggerModePopup('⏯ Play / Pause');
                }}
                className="px-2 py-1.5 bg-neutral-850 hover:bg-neutral-800 rounded-xl text-[10px] font-bold text-neutral-300"
                title="Play / Pause Toggle"
              >
                ⏯
              </button>
              <button
                onClick={() => {
                  controlRouter.nextTrack();
                  triggerModePopup('⏭ Next Track');
                }}
                className="px-2 py-1.5 bg-neutral-850 hover:bg-neutral-800 rounded-xl text-[10px] font-bold text-neutral-300"
                title="Next Track"
              >
                ⏭
              </button>
              <button
                onClick={() => handleKnob2Rotate(-1)}
                className="p-2 bg-neutral-850 hover:bg-neutral-800 rounded-xl text-neutral-300"
                title="Seek Backward 5s"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleKnob2Rotate(1)}
                className="p-2 bg-neutral-850 hover:bg-neutral-800 rounded-xl text-neutral-300"
                title="Seek Forward 5s"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* KNOB 3: SCREEN SWITCHER */}
          <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className="w-12 h-12 rounded-full bg-neutral-950 border-2 border-neutral-700 flex items-center justify-center relative cursor-pointer active:scale-95 transition-transform shadow-inner"
                onClick={handleKnob3Click}
                title="Click: Toggle Screen Menu"
              >
                <div
                  className="w-1.5 h-3 bg-purple-400 rounded-full absolute top-1 transition-transform duration-100"
                  style={{ transform: `rotate(${dial3Angle}deg)` }}
                />
                <Layers className="w-4 h-4 text-neutral-400" />
              </div>
              <div>
                <h4 className="font-bold text-xs text-neutral-200">Knob 3: Screen Switcher</h4>
                <p className="text-[11px] text-neutral-500">Rotate: Cycle Screen • Click: Menu</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={handleKnob3Click}
                className="px-2.5 py-1.5 bg-neutral-850 hover:bg-neutral-800 rounded-xl text-[10px] font-bold text-neutral-300"
                title="Toggle Screen Switcher Menu"
              >
                Menu
              </button>
              <button
                onClick={() => handleKnob3Rotate(-1)}
                className="p-2 bg-neutral-850 hover:bg-neutral-800 rounded-xl text-neutral-300"
                title="Cycle Screen Left"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => handleKnob3Rotate(1)}
                className="p-2 bg-neutral-850 hover:bg-neutral-800 rounded-xl text-neutral-300"
                title="Cycle Screen Right"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* PC 2.4GHz WI-FI HOTSPOT CARD */}
          <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className={`p-2 rounded-xl ${hotspotStatus.isRunning ? 'bg-emerald-500/20 text-emerald-400' : 'bg-neutral-800 text-neutral-400'}`}>
                  <Radio className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-neutral-200">PC 2.4GHz Wi-Fi Hotspot</h4>
                  <p className="text-[11px] text-neutral-500">Direct PC network for ESP32 (no internet required)</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`w-2 h-2 rounded-full ${hotspotStatus.isRunning ? 'bg-emerald-400 animate-pulse' : 'bg-neutral-600'}`} />
                <span className={`text-[10px] font-mono font-bold ${hotspotStatus.isRunning ? 'text-emerald-400' : 'text-neutral-500'}`}>
                  {hotspotStatus.isRunning ? 'ACTIVE' : 'OFF'}
                </span>
              </div>
            </div>

            {hotspotStatus.isRunning ? (
              <div className="space-y-2 pt-1">
                <div className="p-2.5 rounded-xl bg-neutral-950/80 border border-neutral-800 space-y-1 font-mono text-xs">
                  <div className="flex justify-between items-center text-neutral-400">
                    <span>Network (SSID):</span>
                    <span className="font-bold text-neutral-100">{hotspotStatus.ssid}</span>
                  </div>
                  <div className="flex justify-between items-center text-neutral-400">
                    <span>Password:</span>
                    <span className="font-bold text-emerald-400">{hotspotStatus.password}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleHotspot}
                    disabled={isHotspotLoading}
                    className="flex-1 py-2 px-3 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-400 text-xs font-bold transition-all flex items-center justify-center gap-1.5"
                  >
                    {isHotspotLoading ? 'Stopping...' : 'Stop Hotspot'}
                  </button>
                  <button
                    onClick={() => {
                      setWifiSsid(hotspotStatus.ssid);
                      setWifiPass(hotspotStatus.password);
                      setIsSettingsModalOpen(true);
                    }}
                    className="py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-750 text-neutral-300 text-xs font-semibold transition-all"
                    title="Fill ESP32 Provisioning form with Hotspot credentials"
                  >
                    Sync to ESP32
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    value={hotspotSsidInput}
                    onChange={(e) => setHotspotSsidInput(e.target.value)}
                    placeholder="SSID"
                    className="w-full px-3 py-1.5 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    value={hotspotPassInput}
                    onChange={(e) => setHotspotPassInput(e.target.value)}
                    placeholder="Password (≥8 chars)"
                    className="w-full px-3 py-1.5 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <button
                  onClick={handleToggleHotspot}
                  disabled={isHotspotLoading || !hotspotSsidInput.trim() || hotspotPassInput.length < 8}
                  className="w-full py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 transition-all"
                >
                  <Wifi className="w-3.5 h-3.5" />
                  <span>{isHotspotLoading ? 'Starting Hotspot...' : 'Start 2.4GHz Hotspot'}</span>
                </button>
              </div>
            )}

            {hotspotFeedback && (
              <p className="text-[10px] font-mono text-center text-emerald-400 animate-in fade-in">
                {hotspotFeedback}
              </p>
            )}
          </div>

          {/* DESK FOCUS & POMODORO CARD (Merged from Desk Dashboard) */}
          <div className="p-4 rounded-2xl bg-neutral-900/60 border border-neutral-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
                  <Timer className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-xs text-neutral-200">Focus & Pomodoro Timer</h4>
                  <p className="text-[11px] text-neutral-500">Syncs productivity sessions with Desk Deck</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded-full ${
                  isTimerRunning ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'bg-neutral-800 text-neutral-500'
                }`}>
                  {isTimerRunning ? 'ACTIVE' : 'IDLE'}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between p-3 rounded-xl bg-neutral-950/80 border border-neutral-800">
              <div className="flex items-center gap-3">
                <span className="text-2xl font-mono font-extrabold text-neutral-100 tracking-tight">
                  {Math.floor(pomodoroSeconds / 60)}:{String(pomodoroSeconds % 60).padStart(2, '0')}
                </span>
                <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-neutral-850 text-neutral-400">
                  {timerMode}
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setIsTimerRunning((prev) => !prev)}
                  className={`p-2 rounded-xl font-bold text-xs flex items-center gap-1 transition-all ${
                    isTimerRunning
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                  }`}
                >
                  {isTimerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 fill-current" />}
                </button>
                <button
                  onClick={() => {
                    setIsTimerRunning(false);
                    setPomodoroSeconds(25 * 60);
                  }}
                  className="p-2 rounded-xl bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-white transition-all"
                  title="Reset Timer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <button
                onClick={() => {
                  setIsTimerRunning(false);
                  setTimerMode('work');
                  setPomodoroSeconds(25 * 60);
                }}
                className={`flex-1 py-1.5 rounded-lg font-semibold text-[11px] transition-all ${
                  timerMode === 'work' ? 'bg-neutral-800 text-emerald-400 border border-neutral-700' : 'bg-neutral-900 text-neutral-500'
                }`}
              >
                Work (25m)
              </button>
              <button
                onClick={() => {
                  setIsTimerRunning(false);
                  setTimerMode('break');
                  setPomodoroSeconds(5 * 60);
                }}
                className={`flex-1 py-1.5 rounded-lg font-semibold text-[11px] transition-all ${
                  timerMode === 'break' ? 'bg-neutral-800 text-emerald-400 border border-neutral-700' : 'bg-neutral-900 text-neutral-500'
                }`}
              >
                Break (5m)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ESP32 Onboard Settings & Provisioning Modal */}
      {isSettingsModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-lg p-6 shadow-2xl relative">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-neutral-100">ESP32 Hardware Provisioning</h3>
                  <p className="text-[11px] text-neutral-500">Configure Wi-Fi and deck parameters over WebSocket</p>
                </div>
              </div>
              <button
                onClick={() => setIsSettingsModalOpen(false)}
                className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="py-4 space-y-4">
              {/* Wi-Fi Credentials */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-300">Target Wi-Fi Network</label>
                  <button
                    type="button"
                    onClick={() => {
                      setWifiSsid(hotspotStatus.ssid || 'DeskCompanion-Host');
                      setWifiPass(hotspotStatus.password || '12345678');
                    }}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-mono underline cursor-pointer"
                  >
                    Use PC Hotspot credentials
                  </button>
                </div>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={wifiSsid}
                    onChange={(e) => setWifiSsid(e.target.value)}
                    placeholder="Wi-Fi SSID (2.4GHz)"
                    className="w-full px-3.5 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                  <input
                    type="password"
                    value={wifiPass}
                    onChange={(e) => setWifiPass(e.target.value)}
                    placeholder="Wi-Fi Password"
                    className="w-full px-3.5 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-200 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <button
                  onClick={() => {
                    if (!wifiSsid.trim()) {
                      setProvisionMessage('Please enter a Wi-Fi SSID');
                      return;
                    }
                    if (isConnected) {
                      hardwareWs.sendConfig({
                        type: 'wifi_provision',
                        ssid: wifiSsid.trim(),
                        password: wifiPass.trim(),
                      });
                      setProvisionMessage('✓ Wi-Fi credentials dispatched to ESP32!');
                    } else {
                      setProvisionMessage('ESP32 not connected over WS. Connect first or access direct hotspot.');
                    }
                    setTimeout(() => setProvisionMessage(null), 4000);
                  }}
                  className="w-full mt-1 py-2 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold text-xs flex items-center justify-center gap-2 transition-colors"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Send Wi-Fi to ESP32</span>
                </button>
              </div>

              {provisionMessage && (
                <div className="p-2.5 rounded-xl bg-neutral-800/80 border border-neutral-700 text-xs text-center text-emerald-400 font-mono">
                  {provisionMessage}
                </div>
              )}

              {/* Hardware Display Orientation */}
              <div className="space-y-2 pt-2 border-t border-neutral-800">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-neutral-300">Hardware Screen Orientation</label>
                  <button
                    onClick={handleToggleFlip}
                    className={`text-[10px] px-2 py-0.5 rounded border transition-colors flex items-center gap-1 ${
                      isFlipped
                        ? 'border-emerald-500 bg-emerald-500/20 text-emerald-400'
                        : 'border-neutral-700 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <RotateCw className="w-2.5 h-2.5" />
                    <span>{isFlipped ? '180° Flipped' : 'Flip 180°'}</span>
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={() => handleOrientationChange('portrait')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      orientation === 'portrait'
                        ? 'bg-neutral-800 border-emerald-500 text-emerald-400'
                        : 'border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    Portrait (240×320)
                  </button>
                  <button
                    onClick={() => handleOrientationChange('landscape')}
                    className={`py-2 px-3 rounded-xl border text-xs font-semibold transition-all ${
                      orientation === 'landscape'
                        ? 'bg-neutral-800 border-emerald-500 text-emerald-400'
                        : 'border-neutral-800 text-neutral-400 hover:text-white'
                    }`}
                  >
                    Landscape (320×240)
                  </button>
                </div>
              </div>

              {/* Test Pattern trigger */}
              <div className="space-y-2 pt-2 border-t border-neutral-800">
                <label className="text-xs font-semibold text-neutral-300">Diagnostics</label>
                <button
                  onClick={() => {
                    if (isConnected) {
                      hardwareWs.sendConfig({ type: 'run_screen_test' });
                      setProvisionMessage('✓ Color bar test command sent to ESP32');
                      setTimeout(() => setProvisionMessage(null), 3000);
                    } else {
                      setProvisionMessage('Connect to ESP32 first to run screen test.');
                      setTimeout(() => setProvisionMessage(null), 3000);
                    }
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-neutral-800 hover:bg-neutral-750 text-neutral-200 text-xs font-medium border border-neutral-700 transition-colors"
                >
                  Run Screen RGB Test Pattern on ESP32
                </button>
              </div>

              {/* Direct AP Web Config Link */}
              <div className="pt-2 border-t border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500">
                <span>Direct ESP32 Web Config:</span>
                <a
                  href={`http://${mDnsAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-emerald-400 hover:underline"
                >
                  http://{mDnsAddress}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Music-Synced Sinusoidal Breathing Animation */}
      <style>{`
        @keyframes musicBreath {
          0%, 100% {
            opacity: 0.88;
            filter: drop-shadow(0 0 10px rgba(16, 185, 129, 0.25));
          }
          50% {
            opacity: 1;
            filter: drop-shadow(0 0 24px rgba(16, 185, 129, 0.55));
          }
        }
      `}</style>
    </div>
  );
};
