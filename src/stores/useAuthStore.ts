import { create } from 'zustand';
import { AuthSessionDto, TokenBundleDto } from '../types/models';
import { tauriIpc } from '../services/tauriIpc';
import { usePlayerStore } from './usePlayerStore';

interface AuthState {
  session: AuthSessionDto | null;
  tokens: TokenBundleDto | null;
  isLoading: boolean;
  error: string | null;
  checkSession: () => Promise<void>;
  login: (clientId: string) => Promise<void>;
  logout: () => Promise<void>;
  getFreshToken: () => Promise<string>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  session: null,
  tokens: null,
  isLoading: false,
  error: null,

  checkSession: async () => {
    try {
      set({ isLoading: true, error: null });
      const session = await tauriIpc.spotifyGetSession();
      const tokens = await tauriIpc.spotifyGetTokens();
      set({ session, tokens, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  login: async (clientId: string) => {
    try {
      set({ isLoading: true, error: null });
      const tokens = await tauriIpc.spotifyLogin(clientId);
      const session = await tauriIpc.spotifyGetSession();
      set({ tokens, session, isLoading: false });
      usePlayerStore.getState().initialSyncAll();
    } catch (err) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  logout: async () => {
    try {
      await tauriIpc.spotifyLogout();
      set({ session: null, tokens: null, error: null });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  getFreshToken: async (): Promise<string> => {
    const { tokens } = get();
    const nowSecs = Math.floor(Date.now() / 1000);

    if (tokens && nowSecs + 60 < tokens.expiresAt) {
      return tokens.accessToken;
    }

    // Refresh token via Rust backend
    const newTokens = await tauriIpc.spotifyRefreshToken();
    set({ tokens: newTokens });
    return newTokens.accessToken;
  },
}));
