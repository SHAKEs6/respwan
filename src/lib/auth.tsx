import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';

export type Profile = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  xp: number;
  level: number;
  country: string | null;
  favorite_games: string[];
  platforms: string[];
  is_private: boolean;
};

type AuthState = { session: Session | null; user: User | null; profile: Profile | null; loading: boolean; refreshProfile: () => Promise<void> };
const AuthContext = createContext<AuthState>({ session: null, user: null, profile: null, loading: true, refreshProfile: async () => undefined });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = async () => {
    if (!supabase || !session?.user) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('id,username,display_name,avatar_url,bio,xp,level,country,favorite_games,platforms,is_private').eq('id', session.user.id).maybeSingle();
    setProfile(data as Profile | null);
  };

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session);
      setLoading(false);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setProfile(null);
      setLoading(false);
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);

  useEffect(() => { void refreshProfile(); }, [session?.user?.id]);
  const value = useMemo(() => ({ session, user: session?.user ?? null, profile, loading, refreshProfile }), [session, profile, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
