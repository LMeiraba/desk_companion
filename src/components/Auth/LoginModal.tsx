import React, { useState } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { KeyRound, LogOut, ExternalLink, Loader2, CheckCircle2 } from 'lucide-react';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { session, isLoading, error, login, logout } = useAuthStore();
  const [clientId, setClientId] = useState(session?.clientId || '');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim()) return;

    try {
      setStatusMessage('Opening browser for Spotify OAuth2 PKCE login...');
      await login(clientId.trim());
      setStatusMessage('Login successful!');
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setStatusMessage(null);
    }
  };

  const handleLogout = async () => {
    await logout();
    setStatusMessage('Logged out.');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl text-neutral-100">
        <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-500/10 rounded-xl text-emerald-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-semibold text-base">Spotify Integration</h2>
              <p className="text-xs text-neutral-400">OAuth2 PKCE (No secret required)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-neutral-400 hover:text-neutral-200 text-sm px-2 py-1 rounded"
          >
            ✕
          </button>
        </div>

        {session?.isAuthenticated ? (
          <div className="py-6 space-y-4">
            <div className="flex items-center gap-3 p-3.5 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-sm">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-medium">Connected to Spotify</p>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Client ID: {session.clientId.slice(0, 8)}...
                </p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-400 rounded-xl font-medium text-sm transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Disconnect Account
            </button>
          </div>
        ) : (
          <form onSubmit={handleLogin} className="py-5 space-y-4">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Spotify App Client ID
              </label>
              <input
                type="text"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                placeholder="Paste your 32-character Client ID"
                required
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 focus:border-emerald-500 rounded-xl text-sm text-neutral-100 placeholder-neutral-500 outline-none transition-all"
              />
            </div>

            <div className="p-3 bg-neutral-950/80 border border-neutral-800/80 rounded-xl text-xs text-neutral-400 space-y-1.5 leading-relaxed">
              <p className="font-medium text-neutral-300">Quick Setup Instructions:</p>
              <p>
                1. Go to your{' '}
                <a
                  href="https://developer.spotify.com/dashboard"
                  target="_blank"
                  rel="noreferrer"
                  className="text-emerald-400 underline inline-flex items-center gap-0.5 hover:text-emerald-300"
                >
                  Spotify Developer Dashboard <ExternalLink className="w-3 h-3 inline" />
                </a>
              </p>
              <p>2. Create an App (or open an existing one).</p>
              <p>
                3. Add Redirect URI:{' '}
                <code className="text-emerald-400 bg-neutral-900 px-1 py-0.5 rounded">
                  http://127.0.0.1:8888/callback
                </code>
              </p>
              <p>4. Copy the <b>Client ID</b> and paste it above.</p>
            </div>

            {statusMessage && (
              <p className="text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-lg border border-emerald-500/20">
                {statusMessage}
              </p>
            )}

            {error && (
              <p className="text-xs text-red-400 bg-red-500/10 p-2.5 rounded-lg border border-red-500/20">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={isLoading || !clientId.trim()}
              className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-emerald-500 hover:bg-emerald-450 disabled:bg-neutral-800 disabled:text-neutral-500 text-black font-semibold rounded-xl text-sm transition-all shadow-lg shadow-emerald-500/20"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Connecting to Spotify...
                </>
              ) : (
                'Authenticate with Spotify (PKCE)'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
