import { useCallback, useEffect, useState } from 'react';
import type { AuthUser } from '@workspace/api-client-react';

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: () => void;
  logout: () => void;
}

function getBasePath() {
  return import.meta.env.BASE_URL.replace(/\/+$/, '') || '/';
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshUser = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/user', { credentials: 'include' });
      const data = response.ok ? await response.json() as { user: AuthUser | null } : { user: null };
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { void refreshUser(); }, [refreshUser]);

  const login = useCallback(() => {
    const name = window.prompt('What name would you like to use in the Music Library?');
    if (name === null) return;
    const cleanName = name.trim();
    if (!cleanName) {
      window.alert('Please enter a name to continue.');
      return;
    }
    void fetch('/api/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: cleanName }),
    }).then(async (response) => {
      const data = await response.json() as { user?: AuthUser; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error || 'Could not sign in. Please try again.');
      setUser(data.user);
    }).catch((error: unknown) => {
      window.alert(error instanceof Error ? error.message : 'Could not sign in. Please try again.');
    });
  }, []);

  const logout = useCallback(() => {
    void fetch('/api/logout', { method: 'POST', credentials: 'include' })
      .finally(() => { setUser(null); window.location.reload(); });
  }, []);

  return { user, isLoading, isAuthenticated: !!user, login, logout };
}
