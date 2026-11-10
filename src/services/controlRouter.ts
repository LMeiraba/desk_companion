import { usePlayerStore } from '../stores/usePlayerStore';
import { spotifySdk } from './spotifySdk';
import { tauriIpc } from './tauriIpc';

export const controlRouter = {
  volumeMode: (localStorage.getItem('dc_volume_mode') as 'spotify' | 'system' | 'app') || 'spotify',

  setVolumeMode(mode: 'spotify' | 'system' | 'app') {
    this.volumeMode = mode;
    localStorage.setItem('dc_volume_mode', mode);
  },

  cycleVolumeMode(): 'spotify' | 'system' | 'app' {
    const modes: ('spotify' | 'system' | 'app')[] = ['spotify', 'system', 'app'];
    const next = modes[(modes.indexOf(this.volumeMode) + 1) % modes.length];
    this.setVolumeMode(next);
    return next;
  },

  isLocalActive(): boolean {
    const { localDeviceId, activeDeviceId } = usePlayerStore.getState();
    return Boolean(localDeviceId && activeDeviceId && localDeviceId === activeDeviceId);
  },

  isWindowsMediaActive(): boolean {
    const track = usePlayerStore.getState().playbackState?.track;
    return Boolean(track?.id?.startsWith('win_'));
  },

  async togglePlay(): Promise<void> {
    if (this.isWindowsMediaActive()) {
      console.log('[ControlRouter] Dispatching togglePlay -> Windows Media Key');
      await tauriIpc.windowsMediaPlayPause();
      return;
    }
    const player = spotifySdk.getPlayer();
    if (this.isLocalActive() && player) {
      console.log('[ControlRouter] Dispatching togglePlay -> Local Web Playback SDK');
      await player.togglePlay();
    } else {
      console.log('[ControlRouter] Dispatching togglePlay -> Remote Rust Web API');
      const activeId = usePlayerStore.getState().activeDeviceId || undefined;
      await tauriIpc.spotifyTogglePlay(activeId);
    }
  },

  async play(): Promise<void> {
    if (this.isWindowsMediaActive()) {
      await tauriIpc.windowsMediaPlayPause();
      return;
    }
    const player = spotifySdk.getPlayer();
    if (this.isLocalActive() && player) {
      console.log('[ControlRouter] Dispatching play -> Local Web Playback SDK');
      await player.resume();
    } else {
      console.log('[ControlRouter] Dispatching play -> Remote Rust Web API');
      const activeId = usePlayerStore.getState().activeDeviceId || undefined;
      await tauriIpc.spotifyPlay(activeId);
    }
  },

  async pause(): Promise<void> {
    if (this.isWindowsMediaActive()) {
      await tauriIpc.windowsMediaPlayPause();
      return;
    }
    const player = spotifySdk.getPlayer();
    if (this.isLocalActive() && player) {
      console.log('[ControlRouter] Dispatching pause -> Local Web Playback SDK');
      await player.pause();
    } else {
      console.log('[ControlRouter] Dispatching pause -> Remote Rust Web API');
      const activeId = usePlayerStore.getState().activeDeviceId || undefined;
      await tauriIpc.spotifyPause(activeId);
    }
  },

  async nextTrack(): Promise<void> {
    if (this.isWindowsMediaActive()) {
      console.log('[ControlRouter] Dispatching nextTrack -> Windows Media Key');
      await tauriIpc.windowsMediaNext();
      return;
    }
    const player = spotifySdk.getPlayer();
    if (this.isLocalActive() && player) {
      console.log('[ControlRouter] Dispatching nextTrack -> Local Web Playback SDK');
      await player.nextTrack();
    } else {
      console.log('[ControlRouter] Dispatching nextTrack -> Remote Rust Web API');
      const activeId = usePlayerStore.getState().activeDeviceId || undefined;
      await tauriIpc.spotifyNext(activeId);
    }
  },

  async previousTrack(): Promise<void> {
    if (this.isWindowsMediaActive()) {
      console.log('[ControlRouter] Dispatching previousTrack -> Windows Media Key');
      await tauriIpc.windowsMediaPrevious();
      return;
    }
    const player = spotifySdk.getPlayer();
    if (this.isLocalActive() && player) {
      console.log('[ControlRouter] Dispatching previousTrack -> Local Web Playback SDK');
      await player.previousTrack();
    } else {
      console.log('[ControlRouter] Dispatching previousTrack -> Remote Rust Web API');
      const activeId = usePlayerStore.getState().activeDeviceId || undefined;
      await tauriIpc.spotifyPrevious(activeId);
    }
  },

  async seek(positionMs: number): Promise<void> {
    const targetMs = Math.max(0, Math.round(positionMs));
    usePlayerStore.getState().optimisticSeek(targetMs);
    const player = spotifySdk.getPlayer();
    if (this.isLocalActive() && player) {
      try {
        console.log(`[ControlRouter] Dispatching seek (${targetMs}ms) -> Local Web Playback SDK`);
        await player.seek(targetMs);
        return;
      } catch (err) {
        console.warn('[ControlRouter] Local seek failed, falling back to Web API:', err);
      }
    }
    
    // Remote Web API via Rust backend
    try {
      const activeId = usePlayerStore.getState().activeDeviceId || undefined;
      console.log(`[ControlRouter] Dispatching seek (${targetMs}ms) -> Remote Rust Web API (device: ${activeId || 'active'})`);
      await tauriIpc.spotifySeek(targetMs, activeId);
    } catch (err) {
      console.warn('[ControlRouter] Remote seek with deviceId failed, retrying targeting active device:', err);
      try {
        await tauriIpc.spotifySeek(targetMs, undefined);
      } catch (err2) {
        console.error('[ControlRouter] Seek failed:', err2);
      }
    }
  },

  lastNonZeroVolume: 70,

  async toggleMute(): Promise<void> {
    if (this.volumeMode === 'system') {
      console.log('[ControlRouter] Toggling Windows Master Mute');
      await tauriIpc.windowsToggleMute();
      return;
    }
    const currentVolume = usePlayerStore.getState().playbackState?.device?.volumePercent ?? 70;
    if (currentVolume > 0) {
      this.lastNonZeroVolume = currentVolume;
      console.log(`[ControlRouter] Muting volume (saved: ${this.lastNonZeroVolume}%)`);
      await this.setVolume(0);
    } else {
      const restoreVol = this.lastNonZeroVolume > 0 ? this.lastNonZeroVolume : 70;
      console.log(`[ControlRouter] Unmuting volume -> restoring to ${restoreVol}%`);
      await this.setVolume(restoreVol);
    }
  },

  async setVolume(percent: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(percent)));
    if (this.volumeMode === 'system') {
      console.log(`[ControlRouter] Setting Windows Master Volume: ${clamped}%`);
      await tauriIpc.windowsSetVolume(clamped);
      usePlayerStore.getState().setOptimisticVolume(clamped);
      return;
    }

    // 1. Optimistic UI update so slider doesn't bounce/revert
    usePlayerStore.getState().setOptimisticVolume(clamped);

    const player = spotifySdk.getPlayer();
    if (this.isLocalActive() && player) {
      console.log(`[ControlRouter] Dispatching setVolume (${clamped}%) -> Local Web Playback SDK`);
      await spotifySdk.setVolume(clamped / 100);
    } else {
      console.log(`[ControlRouter] Dispatching setVolume (${clamped}%) -> Remote Rust Web API`);
      const activeId = usePlayerStore.getState().activeDeviceId || undefined;
      await tauriIpc.spotifySetVolume(clamped, activeId);
    }
  },

  async transferPlayback(targetDeviceId: string, play: boolean = true): Promise<void> {
    console.log(`[ControlRouter] Transferring playback to device: ${targetDeviceId}`);
    // 1. Optimistic state transition lock to stop UI bounce/stutter
    usePlayerStore.getState().optimisticTransferDevice(targetDeviceId);

    try {
      await tauriIpc.spotifyTransferPlayback(targetDeviceId, play);
    } catch (err) {
      console.error('[ControlRouter] Transfer playback failed:', err);
    }

    // 2. Staggered background polling to allow Spotify Cloud to finish socket handoff
    setTimeout(() => {
      usePlayerStore.getState().fetchDevices();
      usePlayerStore.getState().fetchState();
    }, 1200);

    setTimeout(() => {
      usePlayerStore.getState().fetchDevices();
      usePlayerStore.getState().fetchState();
    }, 2800);
  },
};
