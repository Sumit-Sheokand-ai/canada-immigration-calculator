import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';

const AuthContext = createContext(null);

function getRedirectTo() {
  return `${window.location.origin}${window.location.pathname}`;
}

export function AuthProvider({ children }) {
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !supabase) {
      return;
    }

    let mounted = true;

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (!mounted) return;
        if (error) {
          setLoading(false);
          return;
        }
        setSession(data.session || null);
        setUser(data.session?.user || null);
        setLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        setLoading(false);
      });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession || null);
      setUser(nextSession?.user || null);
      setLoading(false);
    });

    return () => {
      mounted = false;
      data?.subscription?.unsubscribe();
    };
  }, []);

  const sendEmailMagicLink = useCallback(async (email) => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase auth is not configured.');
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: getRedirectTo(),
      },
    });
    if (error) throw error;
    return { status: 'sent' };
  }, []);

  const sendEmailOtp = useCallback(async (email) => {
    return sendEmailMagicLink(email);
  }, [sendEmailMagicLink]);

  const verifyEmailOtp = useCallback(async (email, token) => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase auth is not configured.');
    }
    const possibleTypes = ['email', 'magiclink', 'signup'];
    let lastError = null;
    for (const type of possibleTypes) {
      const { data, error } = await supabase.auth.verifyOtp({ email, token, type });
      if (!error) return data;
      lastError = error;
    }
    throw lastError || new Error('Unable to verify the email code.');
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase auth is not configured.');
    }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getRedirectTo(),
      },
    });
    if (error) throw error;
    return { status: 'redirecting' };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  }, []);

  const updateProfile = useCallback(async ({ fullName }) => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase auth is not configured.');
    }
    const payload = {};
    if (typeof fullName === 'string') {
      payload.data = { full_name: fullName.trim() };
    }
    const { data, error } = await supabase.auth.updateUser(payload);
    if (error) throw error;
    if (data?.user) {
      setUser(data.user);
    }
    return data;
  }, []);

  const refreshSession = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      return null;
    }
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    setSession(data.session || null);
    setUser(data.session?.user || null);
    return data.session || null;
  }, []);

  const value = useMemo(() => ({
    isConfigured: isSupabaseConfigured,
    loading,
    session,
    user,
    isAuthenticated: !!user,
    sendEmailOtp,
    sendEmailMagicLink,
    verifyEmailOtp,
    signInWithGoogle,
    signOut,
    updateProfile,
    refreshSession,
  }), [loading, refreshSession, sendEmailMagicLink, sendEmailOtp, session, signInWithGoogle, signOut, updateProfile, user, verifyEmailOtp]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
