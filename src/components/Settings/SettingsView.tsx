import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { tauriIpc } from '../../services/tauriIpc';
import { weatherService } from '../../services/weatherService';
import {
  Settings,
  KeyRound,
  RefreshCw,
  LogOut,
  CheckCircle,
  Power,
  LogIn,
  CloudSun,
  MapPin,
  Navigation,
  Search,
} from 'lucide-react';

interface SettingsViewProps {
  onOpenLogin?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ onOpenLogin }) => {
  const { session, checkSession, logout } = useAuthStore();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  const [isAutostart, setIsAutostart] = useState(false);

  // Weather Location State
  const [cityInput, setCityInput] = useState('');
  const [currentLocLabel, setCurrentLocLabel] = useState<string>(() => {
    const saved = localStorage.getItem('weather_custom_loc');
    if (saved) {
      try {
        const p = JSON.parse(saved);
        return p.city || 'Custom Location';
      } catch {
        // Ignored
      }
    }
    return 'Auto (IP Geolocation)';
  });
  const [isLocSearching, setIsLocSearching] = useState(false);
  const [locFeedback, setLocFeedback] = useState<string | null>(null);

  useEffect(() => {
    tauriIpc.windowsGetAutostart().then((enabled) => {
      setIsAutostart(enabled);
    });
  }, []);

  const handleSearchCity = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!cityInput.trim()) return;
    setIsLocSearching(true);
    setLocFeedback(null);
    try {
      const res = await weatherService.searchCity(cityInput.trim());
      if (res) {
        localStorage.setItem('weather_custom_loc', JSON.stringify(res));
        setCurrentLocLabel(res.city);
        weatherService.resetCache();
        await weatherService.getWeather();
        setLocFeedback(`✓ Set to ${res.city}`);
        setCityInput('');
      } else {
        setLocFeedback('City not found. Try another name.');
      }
    } catch {
      setLocFeedback('Search failed. Check network.');
    } finally {
      setIsLocSearching(false);
      setTimeout(() => setLocFeedback(null), 4000);
    }
  };

  const handleUseGps = () => {
    if (!navigator.geolocation) {
      setLocFeedback('GPS not supported by device');
      return;
    }
    setIsLocSearching(true);
    setLocFeedback('Acquiring location...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const loc = { city: 'GPS Location', lat, lon };
        localStorage.setItem('weather_custom_loc', JSON.stringify(loc));
        setCurrentLocLabel('GPS Location');
        weatherService.resetCache();
        await weatherService.getWeather();
        setLocFeedback('✓ Using GPS coordinates');
        setIsLocSearching(false);
        setTimeout(() => setLocFeedback(null), 4000);
      },
      (err) => {
        setLocFeedback(`GPS error: ${err.message}`);
        setIsLocSearching(false);
        setTimeout(() => setLocFeedback(null), 4000);
      },
      { timeout: 8000 }
    );
  };

  const handleResetAutoLoc = async () => {
    localStorage.removeItem('weather_custom_loc');
    setCurrentLocLabel('Auto (IP Geolocation)');
    weatherService.resetCache();
    await weatherService.getWeather();
    setLocFeedback('✓ Reset to Auto IP Geolocation');
    setTimeout(() => setLocFeedback(null), 4000);
  };

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

          {/* SETTING 3: WEATHER & LOCATION */}
          <div className="p-6 rounded-3xl bg-neutral-900/60 border border-neutral-800 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-amber-500/10 rounded-xl text-amber-400">
                  <CloudSun className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm tracking-tight text-neutral-100">Weather Location</h3>
                  <p className="text-xs text-neutral-400">Used for live weather on hardware status bar and weather view</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 text-xs font-mono">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                <span className="max-w-[150px] truncate">{currentLocLabel}</span>
              </div>
            </div>

            {/* City search input form */}
            <form onSubmit={handleSearchCity} className="flex items-center gap-2 pt-1">
              <div className="flex-1 flex items-center gap-2 px-3.5 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-xs">
                <Search className="w-4 h-4 text-neutral-500" />
                <input
                  type="text"
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  placeholder="Enter city or ZIP (e.g. Tokyo, London, 10001)..."
                  className="bg-transparent text-neutral-100 focus:outline-none w-full placeholder:text-neutral-600 text-xs"
                />
              </div>

              <button
                type="submit"
                disabled={isLocSearching || !cityInput.trim()}
                className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:opacity-50 text-black text-xs font-bold transition-all shadow-md shadow-emerald-500/20"
              >
                {isLocSearching ? 'Searching...' : 'Set City'}
              </button>
            </form>

            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUseGps}
                  disabled={isLocSearching}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-neutral-800 hover:bg-neutral-750 text-neutral-300 text-xs font-semibold transition-colors"
                  title="Detect location using OS GPS / browser geolocation"
                >
                  <Navigation className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Use Device GPS</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetAutoLoc}
                  className="px-3 py-1.5 rounded-xl bg-neutral-850 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 text-xs font-semibold transition-colors"
                  title="Clear manual override and detect city by IP"
                >
                  Reset to Auto IP
                </button>
              </div>

              {locFeedback && (
                <span className="text-xs font-mono text-emerald-400 animate-in fade-in">
                  {locFeedback}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
