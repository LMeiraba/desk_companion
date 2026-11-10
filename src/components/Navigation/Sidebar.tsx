import React from 'react';
import { usePlayerStore } from '../../stores/usePlayerStore';
import { useAuthStore } from '../../stores/useAuthStore';
import { useNotificationStore } from '../../stores/useNotificationStore';
import {
  Music2,
  Cpu,
  Sliders,
  Bell,
  Settings,
} from 'lucide-react';

export type TabType = 'spotify' | 'hardware' | 'windows' | 'notifications' | 'settings';

interface SidebarProps {
  activeTab: TabType;
  onSelectTab: (tab: TabType) => void;
  onOpenLogin: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onSelectTab,
  onOpenLogin,
}) => {
  const { session } = useAuthStore();
  const { playbackState } = usePlayerStore();
  const { mirrorToHardware } = useNotificationStore();

  const navItems: { id: TabType; label: string; icon: React.ReactNode; badge?: string }[] = [
    {
      id: 'spotify',
      label: 'Spotify Hub',
      icon: <Music2 className="w-5 h-5" />,
      badge: playbackState?.isPlaying ? 'PLAYING' : undefined,
    },
    {
      id: 'hardware',
      label: 'Hardware Deck',
      icon: <Cpu className="w-5 h-5" />,
      badge: 'ESP32',
    },
    {
      id: 'windows',
      label: 'Windows Hub',
      icon: <Sliders className="w-5 h-5" />,
      badge: 'WASAPI',
    },
    {
      id: 'notifications',
      label: 'Push Alerts',
      icon: <Bell className="w-5 h-5" />,
      badge: mirrorToHardware ? 'MIRROR' : undefined,
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: <Settings className="w-5 h-5" />,
    },
  ];

  return (
    <aside className="w-64 bg-neutral-950 border-r border-neutral-900 flex flex-col justify-between p-4 flex-shrink-0 select-none">
      {/* Brand / Logo */}
      <div className="space-y-6">
        <div className="flex items-center gap-3 px-2 pt-2">
          <div className="p-2.5 bg-emerald-500 rounded-2xl text-black shadow-lg shadow-emerald-500/20">
            <Music2 className="w-5 h-5 stroke-[2.5]" />
          </div>
          <div>
            <h1 className="font-extrabold text-sm tracking-tight text-neutral-100">
              DESK COMPANION
            </h1>
            <p className="text-[10px] text-neutral-500 font-mono tracking-wider">
              ESP32-C3 SUPERMINI
            </p>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="space-y-1.5">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-2xl font-semibold text-xs tracking-tight transition-all duration-200 group ${
                  isActive
                    ? 'bg-neutral-850 text-emerald-400 border border-neutral-750 shadow-md shadow-black/40'
                    : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`transition-colors ${
                      isActive ? 'text-emerald-400' : 'text-neutral-500 group-hover:text-neutral-300'
                    }`}
                  >
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </div>

                {item.badge && (
                  <span
                    className={`text-[9px] px-2 py-0.5 rounded-full font-mono font-bold tracking-wider ${
                      item.badge === 'PLAYING'
                        ? 'bg-emerald-500/20 text-emerald-400 animate-pulse'
                        : 'bg-neutral-800 text-neutral-400'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Footer Info / Auth Button */}
      {!session?.isAuthenticated && (
        <div className="pt-4 border-t border-neutral-900">
          <button
            onClick={onOpenLogin}
            className="w-full py-3 px-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-2xl text-xs transition-all shadow-lg shadow-emerald-500/20"
          >
            Connect Spotify
          </button>
        </div>
      )}
    </aside>
  );
};
