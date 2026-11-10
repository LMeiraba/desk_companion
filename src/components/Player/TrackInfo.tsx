import React from 'react';
import { TrackDto } from '../../types/models';

interface TrackInfoProps {
  track: TrackDto | null;
}

export const TrackInfo: React.FC<TrackInfoProps> = ({ track }) => {
  if (!track) {
    return (
      <div className="text-center space-y-1 my-3">
        <h2 className="text-lg font-semibold text-neutral-400">Ready to Play</h2>
        <p className="text-sm text-neutral-600">Select a device or start playing on Spotify</p>
      </div>
    );
  }

  return (
    <div className="text-center space-y-1 my-3 px-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold text-neutral-100 truncate tracking-tight" title={track.name}>
        {track.name}
      </h2>
      <p className="text-sm font-medium text-neutral-400 truncate" title={track.artists.join(', ')}>
        {track.artists.join(', ')}
      </p>
      {track.albumName && (
        <p className="text-xs text-neutral-500 truncate" title={track.albumName}>
          {track.albumName}
        </p>
      )}
    </div>
  );
};
