import React from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { Radio, Speaker, WifiOff } from 'lucide-react';

export const SyncModeBadge: React.FC = () => {
  const isSdkActive = usePlayerStore((s) => s.isSdkActive);
  const isPolling = usePlayerStore((s) => s.isPolling);
  const isOnline = usePlayerStore((s) => s.isOnline);
  const networkRetrySecs = usePlayerStore((s) => s.networkRetrySecs);
  const activeDevice = usePlayerStore((s) => s.playbackState?.device);

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/15 border border-amber-500/30 text-amber-400 text-xs font-medium shadow-sm shadow-amber-500/10">
        <WifiOff className="w-3.5 h-3.5 animate-pulse" />
        <span>
          Network Outage (Backing off — retrying in {networkRetrySecs > 0 ? `${networkRetrySecs}s` : 'a moment'})
        </span>
      </div>
    );
  }

  if (isSdkActive) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-medium shadow-sm shadow-emerald-500/10">
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
        </span>
        <Speaker className="w-3.5 h-3.5" />
        <span>Local Connect Speaker (Realtime - Poller Halted)</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-500/15 border border-sky-500/30 text-sky-400 text-xs font-medium shadow-sm shadow-sky-500/10">
      <Radio className="w-3.5 h-3.5 animate-pulse" />
      <span>
        Remote Mode ({activeDevice?.name || 'External'} - 4s Adaptive Poller {isPolling ? 'Active' : 'Idle'})
      </span>
    </div>
  );
};
