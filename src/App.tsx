import React, { useEffect, useState } from 'react';
import { useAuthStore } from './stores/useAuthStore';
import { usePlayerStore } from './stores/usePlayerStore';
import { useAdaptiveSync } from './hooks/useAdaptiveSync';
import { useSpotifySdk } from './hooks/useSpotifySdk';
import { useMediaSession } from './hooks/useMediaSession';
import { useHardwareSync } from './hooks/useHardwareSync';
import { Sidebar, TabType } from './components/Navigation/Sidebar';
import { PersistentPlayerBar } from './components/Player/PersistentPlayerBar';
import { SpotifyView } from './components/Spotify/SpotifyView';
import { HardwareStudioView } from './components/HardwareStudio/HardwareStudioView';
import { WindowsControlView } from './components/WindowsControl/WindowsControlView';
import { NotificationsView } from './components/Notifications/NotificationsView';
import { SettingsView } from './components/Settings/SettingsView';
import { DevicePicker } from './components/Devices/DevicePicker';
import { LoginModal } from './components/Auth/LoginModal';
import { SyncedLyricsView } from './components/Lyrics/SyncedLyricsView';
import { MiniPlayerModal } from './components/MiniPlayer/MiniPlayerModal';
import { hardwareWs } from './services/hardwareWs';

import { getCurrentWindow, PhysicalPosition, PhysicalSize } from '@tauri-apps/api/window';

export const App: React.FC = () => {
  const { session, checkSession } = useAuthStore();
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    return (localStorage.getItem('dc_active_tab') as TabType) || 'hardware';
  });
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const [isDevicePickerOpen, setIsDevicePickerOpen] = useState(false);
  const [isLyricsModalOpen, setIsLyricsModalOpen] = useState(false);
  const [isMiniPlayerOpen, setIsMiniPlayerOpen] = useState(false);

  // Initialize adaptive polling and Web SDK background lifecycles
  useAdaptiveSync();
  useSpotifySdk();
  useMediaSession();
  useHardwareSync();

  // Restore & persist window position and size
  useEffect(() => {
    const restoreWindowState = async () => {
      try {
        const appWin = getCurrentWindow();
        const savedPos = localStorage.getItem('dc_window_pos');
        const savedSize = localStorage.getItem('dc_window_size');

        if (savedPos) {
          const { x, y } = JSON.parse(savedPos);
          if (typeof x === 'number' && typeof y === 'number') {
            await appWin.setPosition(new PhysicalPosition(x, y));
          }
        }
        if (savedSize) {
          const { width, height } = JSON.parse(savedSize);
          if (typeof width === 'number' && typeof height === 'number') {
            await appWin.setSize(new PhysicalSize(width, height));
          }
        }
      } catch (err) {
        console.warn('[Window] Could not restore window state:', err);
      }
    };

    restoreWindowState();

    // Debounced listener to persist window state on move and resize
    let saveTimeout: ReturnType<typeof setTimeout> | null = null;
    const saveState = async () => {
      try {
        const appWin = getCurrentWindow();
        const pos = await appWin.outerPosition();
        const size = await appWin.outerSize();
        localStorage.setItem('dc_window_pos', JSON.stringify({ x: pos.x, y: pos.y }));
        localStorage.setItem('dc_window_size', JSON.stringify({ width: size.width, height: size.height }));
      } catch {
        // Ignored in non-Tauri browser environments
      }
    };

    const handleWindowChange = () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      saveTimeout = setTimeout(saveState, 500);
    };

    let unlistenResize: (() => void) | undefined;
    let unlistenMove: (() => void) | undefined;

    try {
      const appWin = getCurrentWindow();
      appWin.onResized(handleWindowChange).then((fn) => { unlistenResize = fn; });
      appWin.onMoved(handleWindowChange).then((fn) => { unlistenMove = fn; });
    } catch {
      // Ignored
    }

    return () => {
      if (saveTimeout) clearTimeout(saveTimeout);
      if (unlistenResize) unlistenResize();
      if (unlistenMove) unlistenMove();
    };
  }, []);

  const handleSelectTab = (tab: TabType) => {
    setActiveTab(tab);
    localStorage.setItem('dc_active_tab', tab);
    setIsLyricsModalOpen(false);
  };

  useEffect(() => {
    checkSession().then(() => {
      if (useAuthStore.getState().session?.isAuthenticated) {
        usePlayerStore.getState().initialSyncAll();
      }
    });
  }, [checkSession]);

  return (
    <div className="flex h-screen w-screen bg-neutral-950 text-neutral-100 select-none overflow-hidden font-sans">
      {/* Left Cyber Sidebar Navigation */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={handleSelectTab}
        onOpenLogin={() => {
          setIsAuthOpen(true);
          setIsLyricsModalOpen(false);
        }}
      />

      {/* Main App Workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950">
        <div className="flex-1 flex flex-col h-full overflow-hidden">
          {/* Main Workspace: Active Tab + Full Synced Lyrics Overlay */}
          <div className="flex-1 flex flex-col h-full overflow-hidden relative">
            {activeTab === 'spotify' && (
              <SpotifyView onOpenLogin={() => setIsAuthOpen(true)} />
            )}
            {activeTab === 'hardware' && <HardwareStudioView />}
            {activeTab === 'windows' && <WindowsControlView />}
            {activeTab === 'notifications' && <NotificationsView />}
            {activeTab === 'settings' && (
              <SettingsView onOpenLogin={() => setIsAuthOpen(true)} />
            )}

            {/* Floating Synced Lyrics Overlay - Only for non-Spotify tabs */}
            {isLyricsModalOpen && activeTab !== 'spotify' && (
              <div
                className="absolute inset-0 z-40 bg-black/85 backdrop-blur-xl flex flex-col animate-in fade-in duration-150"
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    setIsLyricsModalOpen(false);
                  }
                }}
              >
                <SyncedLyricsView onClose={() => setIsLyricsModalOpen(false)} />
              </div>
            )}
          </div>

          {/* Persistent Global Bottom Player Bar */}
          {session?.isAuthenticated && (
            <PersistentPlayerBar
              onOpenDevicePicker={() => {
                setIsDevicePickerOpen(true);
                setIsLyricsModalOpen(false);
              }}
              isLyricsOpen={activeTab === 'spotify'}
              onToggleLyrics={() => {
                setActiveTab('spotify');
                setIsLyricsModalOpen(false);
                usePlayerStore.getState().setDeckScreen('lyrics');
                localStorage.setItem('dc_deck_screen', 'lyrics');
                if (hardwareWs.getIsConnected()) {
                  hardwareWs.sendConfig({ type: 'set_screen', screen: 'lyrics' });
                }
              }}
              onToggleMiniPlayer={() => setIsMiniPlayerOpen(!isMiniPlayerOpen)}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      <LoginModal isOpen={isAuthOpen} onClose={() => setIsAuthOpen(false)} />
      <DevicePicker isOpen={isDevicePickerOpen} onClose={() => setIsDevicePickerOpen(false)} />
      <MiniPlayerModal isOpen={isMiniPlayerOpen} onClose={() => setIsMiniPlayerOpen(false)} />
    </div>
  );
};

export default App;
