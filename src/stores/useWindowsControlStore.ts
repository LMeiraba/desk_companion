import { create } from 'zustand';

interface AppVolumeMap {
  [appName: string]: number;
}

interface WindowsControlStore {
  // Master Audio
  masterVolume: number;
  isMuted: boolean;
  setMasterVolume: (vol: number) => void;
  toggleMute: () => void;

  // Per-App Volume
  appVolumes: AppVolumeMap;
  setAppVolume: (app: string, vol: number) => void;

  // Display & Brightness
  monitorBrightness: number;
  isNightLight: boolean;
  setMonitorBrightness: (brightness: number) => void;
  toggleNightLight: () => void;

  // Microphone
  isMicMuted: boolean;
  micGain: number;
  toggleMicMute: () => void;
  setMicGain: (gain: number) => void;

  // Real-time Audio Beat & Loudness
  audioLoudness: number; // 0 - 100%
  isBeatPulse: boolean;
  beatSensitivity: 'low' | 'normal' | 'high';
  setAudioLoudness: (loudness: number) => void;
  triggerBeatPulse: () => void;
  setBeatSensitivity: (sens: 'low' | 'normal' | 'high') => void;

  // Hardware Knob Mapping Preferences
  knob1Target: 'master' | 'spotify' | 'brightness';
  knob2Target: 'seek' | 'track_nav' | 'app_volume';
  knob3Target: 'screen_cycle' | 'window_focus';
  setKnob1Target: (target: 'master' | 'spotify' | 'brightness') => void;
  setKnob2Target: (target: 'seek' | 'track_nav' | 'app_volume') => void;
  setKnob3Target: (target: 'screen_cycle' | 'window_focus') => void;

  // Windows Media Fallback (VLC, Brave, Chrome, YouTube, Instagram)
  windowsMedia: {
    source: string;
    title: string;
    artist: string;
    album: string;
    isPlaying: boolean;
    albumArtUrl?: string;
    progressMs?: number;
    durationMs?: number;
    timestamp: number;
  } | null;
  setWindowsMedia: (
    media: {
      source: string;
      title: string;
      artist: string;
      album: string;
      isPlaying: boolean;
      albumArtUrl?: string;
      progressMs?: number;
      durationMs?: number;
      timestamp: number;
    } | null
  ) => void;
}

export const useWindowsControlStore = create<WindowsControlStore>((set) => ({
  masterVolume: 72,
  isMuted: false,
  setMasterVolume: (vol) => set({ masterVolume: Math.max(0, Math.min(100, vol)) }),
  toggleMute: () => set((state) => ({ isMuted: !state.isMuted })),

  windowsMedia: null,
  setWindowsMedia: (media) => set({ windowsMedia: media }),

  appVolumes: {
    Spotify: 85,
    'Google Chrome': 60,
    Discord: 75,
    'System Sounds': 40,
  },
  setAppVolume: (app, vol) =>
    set((state) => ({
      appVolumes: {
        ...state.appVolumes,
        [app]: Math.max(0, Math.min(100, vol)),
      },
    })),

  monitorBrightness: 80,
  isNightLight: false,
  setMonitorBrightness: (b) => set({ monitorBrightness: Math.max(0, Math.min(100, b)) }),
  toggleNightLight: () => set((state) => ({ isNightLight: !state.isNightLight })),

  isMicMuted: false,
  micGain: 85,
  toggleMicMute: () => set((state) => ({ isMicMuted: !state.isMicMuted })),
  setMicGain: (gain) => set({ micGain: Math.max(0, Math.min(100, gain)) }),

  audioLoudness: 64,
  isBeatPulse: false,
  beatSensitivity: 'normal',
  setAudioLoudness: (loudness) => set({ audioLoudness: loudness }),
  triggerBeatPulse: () => {
    set({ isBeatPulse: true });
    setTimeout(() => set({ isBeatPulse: false }), 140);
  },
  setBeatSensitivity: (beatSensitivity) => set({ beatSensitivity }),

  knob1Target: 'master',
  knob2Target: 'seek',
  knob3Target: 'screen_cycle',
  setKnob1Target: (knob1Target) => set({ knob1Target }),
  setKnob2Target: (knob2Target) => set({ knob2Target }),
  setKnob3Target: (knob3Target) => set({ knob3Target }),
}));
