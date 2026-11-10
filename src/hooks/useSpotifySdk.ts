import { useEffect } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { spotifySdk } from '../services/spotifySdk';

export function useSpotifySdk() {
  const isAuthenticated = useAuthStore((s) => s.session?.isAuthenticated);

  useEffect(() => {
    if (isAuthenticated) {
      spotifySdk.initialize();
    } else {
      spotifySdk.disconnect();
    }

    return () => {
      // Don't disconnect on normal re-renders, only unmount
    };
  }, [isAuthenticated]);
}
