import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import { backend, type AuthUser, type UserProfile } from '@/services/backend';

type NewProfile = Omit<UserProfile, 'uid' | 'email' | 'createdAt'>;

type AuthState = {
  /** False until the saved sign-in has been checked. */
  ready: boolean;
  user: AuthUser | null;
  profile: UserProfile | null;
  mode: 'firebase' | 'local';
  signIn(email: string, password: string): Promise<void>;
  register(email: string, password: string, profile: NewProfile): Promise<void>;
  /** For an account that exists but has no profile yet, for example when sign-up was interrupted. */
  completeProfile(profile: NewProfile): Promise<void>;
  updateProfile(changes: Partial<NewProfile>): Promise<void>;
  signOut(): Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    let alive = true;
    const off = backend.onAuthChange(async (u) => {
      if (!alive) return;
      if (!u) {
        setUser(null);
        setProfile(null);
        setReady(true);
        return;
      }
      setUser(u);
      try {
        const p = await backend.getProfile(u.uid);
        if (alive) setProfile((current) => p ?? current);
      } catch {
        // Offline at launch: keep whatever profile is already in memory.
      } finally {
        if (alive) setReady(true);
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const u = await backend.signIn(email, password);
    const p = await backend.getProfile(u.uid);
    setUser(u);
    setProfile(p);
  }, []);

  const register = useCallback(async (email: string, password: string, input: NewProfile) => {
    const u = await backend.signUp(email, password);
    const p: UserProfile = { ...input, uid: u.uid, email: u.email, createdAt: Date.now() };
    // Show the app straight away; the profile is saved in the background.
    setProfile(p);
    setUser(u);
    await backend.saveProfile(p);
  }, []);

  const completeProfile = useCallback(
    async (input: NewProfile) => {
      if (!user) throw new Error('Sign in first.');
      const p: UserProfile = { ...input, uid: user.uid, email: user.email, createdAt: Date.now() };
      setProfile(p);
      await backend.saveProfile(p);
    },
    [user],
  );

  const updateProfile = useCallback(
    async (changes: Partial<NewProfile>) => {
      if (!profile) return;
      const next = { ...profile, ...changes };
      setProfile(next);
      await backend.saveProfile(next);
    },
    [profile],
  );

  const signOut = useCallback(async () => {
    await backend.signOut();
    setUser(null);
    setProfile(null);
  }, []);

  const value = useMemo<AuthState>(
    () => ({ ready, user, profile, mode: backend.mode, signIn, register, completeProfile, updateProfile, signOut }),
    [ready, user, profile, signIn, register, completeProfile, updateProfile, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}

/** The signed-in learner's profile. Only call on screens behind the sign-in. */
export function useProfile(): UserProfile {
  const { profile } = useAuth();
  if (!profile) throw new Error('No profile loaded');
  return profile;
}
