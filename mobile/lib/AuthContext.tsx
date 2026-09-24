import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, type AuthUser } from '@/api/client';
import { clearSessionToken } from '@/lib/session';

type RegisterInput = {
  email: string;
  password: string;
  inviteToken: string;
  default_tax_rate?: number;
};

type AuthContextValue = {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoadingAuth: boolean;
  authError: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (data: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
  deleteAccount: (password: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoadingAuth, setLoading] = useState(true);
  const [authError, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setUser(await api.auth.me());
    } catch (error) {
      setUser(null);
      const status = (error as { status?: number }).status;
      if (status !== 401 && status !== 0) {
        setError(error instanceof Error ? error.message : 'Auth check failed');
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const login = useCallback(async (email: string, password: string) => {
    setError(null);
    const result = await api.auth.login(email, password);
    setUser({ id: result.id, email: result.email });
  }, []);

  const register = useCallback(async (data: RegisterInput) => {
    setError(null);
    const result = await api.auth.register(data);
    setUser({ id: result.id, email: result.email });
  }, []);

  const logout = useCallback(async () => {
    await api.auth.logout();
    setUser(null);
  }, []);

  const deleteAccount = useCallback(async (password: string) => {
    await api.auth.deleteAccount(password);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({
      user,
      isAuthenticated: !!user,
      isLoadingAuth,
      authError,
      login,
      register,
      logout,
      deleteAccount,
      refresh,
    }),
    [user, isLoadingAuth, authError, login, register, logout, deleteAccount, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export async function wipeLocalSession() {
  await clearSessionToken();
}
