import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { tauriIpc } from '../../services/tauriIpc';
import {
  Settings,
  KeyRound,
  RefreshCw,
  LogOut,
  CheckCircle,
  Power,
  LogIn,
} from 'lucide-react';

interface SettingsViewProps {
  onOpenLogin?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenLogin }) => {
  const { session, checkSession, logout } = useAuthStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  const [isAutostart, setIsAutostart] = useState(false);

  useEffect(() => {
    tauriIpc.windowsGetAutostart().then((enabled) => {
      setIsAutostart(enabled);
    });
  }, []);

  const handleToggleAutostart = async () => {
    const nextVal = !isAutostart;
    setIsAutostart(nextVal);
    await tauriIpc.windowsSetAutostart(nextVal);
  };

  const handleRefreshToken = async () => {
    try {
      setIsRefreshing(true);
      await tauriIpc.spotifyRefreshToken();
      await checkSession();
      setRefreshSuccess(true);
      setTimeout(() => setRefreshSuccess(false), 3000);
    } catch (err) {
      console.error('Refresh token failed:', err);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSignIn = () => {
    onOpenLogin?.();
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-neutral-950">
      {/* Top Header */}
      <div className="flex items-center justify-between px-8 py-4 border-b border-neutral-900 bg-neutral-950/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-neutral-800 text-neutral-300 rounded-2xl">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-bold text-base tracking-tight text-neutral-100">Companion Settings</h2>
            <p className="text-xs text-neutral-400">Account session and system startup preferences</p>
          </div>
        </div>
      </div>

      {/* Main Settings Form */}
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          {/* SETTING 1: SPOTIFY AUTHENTICATION */}
          <div className="p-6 rounded-3xl bg-neutral-900/60 border border-neutral-800 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight text-neutral-100">Spotify Account</h3>
                  <p className="text-xs text-neutral-400">OAuth session & token lifecycle</p>
                </div>
              </div>

              {session?.isAuthenticated ? (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold font-mono">
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Authenticated</span>
                </div>
              ) : (
                <span className="text-xs text-neutral-500 font-mono">Not Signed In</span>
              )}
            </div>

            <div className="flex items-center gap-3 pt-2">
              {session?.isAuthenticated ? (
                <>
                  <button
                    onClick={handleRefreshToken}
                    disabled={isRefreshing}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-750 text-neutral-200 text-xs font-semibold transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                    <span>{refreshSuccess ? 'Token Refreshed!' : 'Refresh Token'}</span>
                  </button>

                  <button
                    onClick={logout}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 text-xs font-semibold transition-colors"
                  >
                    <LogOut className="w-3.5 h-3.5" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={handleSignIn}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition-all shadow-lg shadow-emerald-500/20"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Sign In with Spotify</span>
                </button>
              )}
            </div>
          </div>

          {/* SETTING 2: WINDOWS AUTOSTART */}
          <div className="p-6 rounded-3xl bg-neutral-900/60 border border-neutral-800 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-cyan-500/10 rounded-xl text-cyan-400">
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight text-neutral-100">Launch on Windows Startup</h3>
                  <p className="text-xs text-neutral-400">Automatically run Desk Companion in background on boot</p>
                </div>
              </div>

              <button
                onClick={handleToggleAutostart}
                className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${
                  isAutostart
                    ? 'bg-emerald-500 hover:bg-emerald-400 text-black border-emerald-400 shadow-md shadow-emerald-500/20'
                    : 'bg-neutral-800 hover:bg-neutral-750 text-neutral-300 border-neutral-700'
                }`}
              >
                {isAutostart ? 'Enabled' : 'Disabled'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
