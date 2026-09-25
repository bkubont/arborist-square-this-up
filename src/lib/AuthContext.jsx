import { createContext, useState, useContext, useEffect } from 'react';
import { api } from '@/api/client';
import { assignAppPath } from '@/lib/desktopSession';
import { queryClientInstance } from '@/lib/query-client';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoadingAuth, setLoading] = useState(true);
  const [authError, setError] = useState(null);
  const checkUserAuth = async () => {
    setLoading(true); setError(null);
    try { setUser(await api.auth.me()); }
    catch (error) { setUser(null); if (error.status !== 401) setError(error.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { checkUserAuth(); }, []);
  const logout = async () => {
    await api.auth.logout(); queryClientInstance.clear(); setUser(null); assignAppPath('/login');
  };
  return <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoadingAuth, authChecked: !isLoadingAuth, authError, logout, checkUserAuth }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
