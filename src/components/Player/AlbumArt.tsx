import React from 'react';
import { Disc3 } from 'lucide-react';

interface AlbumArtProps {
  url?: string;
  name?: string;
  isPlaying?: boolean;
}

export const AlbumArt: React.FC<AlbumArtProps> = ({ url, name, isPlaying }) => {
  return (
    <div className="relative group w-48 h-48 sm:w-56 sm:h-56 mx-auto flex-shrink-0">
      {/* Ambient glow behind album art */}
      {url && (
        <div
          className={`absolute inset-0 rounded-3xl bg-cover bg-center blur-2xl opacity-40 transition-all duration-700 ${
            isPlaying ? 'scale-105 opacity-60' : 'scale-95 opacity-20'
          }`}
          style={{ backgroundImage: `url(${url})` }}
        />
      )}

      {/* Main Album Artwork */}
      <div className="relative w-full h-full rounded-2xl overflow-hidden bg-neutral-900 border border-neutral-800 shadow-2xl flex items-center justify-center">
        {url ? (
          <img
            src={url}
            alt={name || 'Album Art'}
            className="w-full h-full object-cover select-none"
            draggable={false}
          />
        ) : (
          <div className="flex flex-col items-center justify-center text-neutral-600 gap-2">
            <Disc3 className="w-16 h-16 animate-spin duration-1000" />
            <span className="text-xs font-medium">No Album Art</span>
          </div>
        )}
      </div>
    </div>
  );
};
