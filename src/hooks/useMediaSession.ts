import { useEffect } from 'react';
import { usePlayerStore } from '../stores/usePlayerStore';
import { controlRouter } from '../services/controlRouter';

export function useMediaSession() {
  const { playbackState } = usePlayerStore();

  useEffect(() => {
    if (!('mediaSession' in navigator)) return;

    const track = playbackState?.track;

    if (track) {
      // 1. Update Windows SMTC metadata (Song name, Artist, Album, Cover art)
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.name,
        artist: track.artists.join(', '),
        album: track.albumName,
        artwork: track.albumArtUrl
          ? [
              { src: track.albumArtUrl, sizes: '96x96', type: 'image/jpeg' },
              { src: track.albumArtUrl, sizes: '128x128', type: 'image/jpeg' },
              { src: track.albumArtUrl, sizes: '256x256', type: 'image/jpeg' },
              { src: track.albumArtUrl, sizes: '512x512', type: 'image/jpeg' },
            ]
          : [],
      });

      // 2. Sync Windows taskbar / title bar
      document.title = `${track.name} • ${track.artists[0] || ''} — Desk Companion`;
    } else {
      navigator.mediaSession.metadata = null;
      document.title = 'Desk Companion';
    }

    // 3. Sync playback state (Playing vs Paused)
    navigator.mediaSession.playbackState = playbackState?.isPlaying ? 'playing' : 'paused';

    // 4. Bind Windows Hardware Media Keys & SMTC buttons
    navigator.mediaSession.setActionHandler('play', () => {
      controlRouter.play();
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      controlRouter.pause();
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      controlRouter.previousTrack();
    });

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      controlRouter.nextTrack();
    });

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      if (details.seekTime !== undefined) {
        controlRouter.seek(details.seekTime * 1000);
      }
    });
  }, [playbackState?.track?.id, playbackState?.track?.name, playbackState?.isPlaying]);
}
