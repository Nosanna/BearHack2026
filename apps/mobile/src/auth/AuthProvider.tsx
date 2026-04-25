import React, { createContext, useContext, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import { api, setSessionExpiredHandler, tokenStorage } from '../api/client';
import type { UserDto } from '@fixit/shared';

interface AuthContextValue {
  user: UserDto | null;
  isHydrating: boolean;
  signIn: (idToken: string) => Promise<void>;
  devSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<UserDto | null>(null);
  const [isHydrating, setHydrating] = useState(true);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      setUser(null);
    });
    return () => setSessionExpiredHandler(null);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const access = await tokenStorage.getAccess();
        if (!access) return;
        // Fetch user via dashboard endpoint as a side-effect-light validity check.
        const home = await api.dashboardHome();
        setUser(home.user);
      } catch {
        await tokenStorage.clear();
      } finally {
        setHydrating(false);
      }
    })();
  }, []);

  const signIn = async (idToken: string) => {
    const res = await api.login(idToken);
    setUser(res.user);
  };

  const devSignIn = async () => {
    const res = await api.devLogin();
    setUser(res.user);
  };

  const signOut = async () => {
    await api.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isHydrating, signIn, devSignIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider.');
  return ctx;
}

// Convenience: secure storage flag for Android keystore (no-op here, just to keep the import).
void SecureStore;
