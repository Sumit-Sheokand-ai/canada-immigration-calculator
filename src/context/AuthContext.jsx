import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '../utils/supabaseClient';

const AuthContext = createContext(null);

function getRedirectTo() {
  return `${window.location.origin}${window.location.pathname}`;
}

async function extractEdgeFunctionErrorMessage(error) {
  if (!error) return '';
  const messages = [];
  if (error.message) messages.push(String(error.message));

  const context = error.context;
  if (!context || typeof context.clone !== 'function') {
    return messages.join(' · ').trim();
  }

  try {
    const response = context.clone();
    const contentType = response.headers?.get?.('content-type') || '';
    if (contentType.includes('application/json')) {
      const body = await response.json();
      const bodyMessages = [
        body?.message,
        body?.error,
        body?.details,
      ].filter(Boolean).map((value) => String(value));
      if (bodyMessages.length) messages.push(...bodyMessages);
    } else {
      const rawText = await response.text();
      if (rawText) messages.push(rawText);
    }
  } catch {
    // no-op: fallback to top-level error message only
  }

  return [...new Set(messages)].join(' · ').trim();
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

  const changePassword = useCallback(async (password) => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase auth is not configured.');
    }
    const nextPassword = String(password || '');
    if (nextPassword.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
    const { data, error } = await supabase.auth.updateUser({ password: nextPassword });
    if (error) throw error;
    if (data?.user) {
      setUser(data.user);
    }
    return data;
  }, []);

  const deleteAccount = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) {
      throw new Error('Supabase auth is not configured.');
    }

    const functionName = import.meta.env.VITE_SUPABASE_DELETE_ACCOUNT_FUNCTION || 'delete-account';
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: { confirm: true },
    });

    if (error) {
      const details = await extractEdgeFunctionErrorMessage(error);
      const fallback = details || String(error?.message || '');
      if (/Function not found/i.test(fallback)) {
        throw new Error(`Delete account is not configured. Deploy the Supabase "${functionName}" edge function first.`);
      }
      throw new Error(fallback || 'Could not delete account.');
    }

    if (data?.success === false) {
      throw new Error(String(data?.message || data?.error || 'Could not delete account.'));
    }

    await supabase.auth.signOut();
    setSession(null);
    setUser(null);
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
    changePassword,
    deleteAccount,
    refreshSession,
  }), [changePassword, deleteAccount, loading, refreshSession, sendEmailMagicLink, sendEmailOtp, session, signInWithGoogle, signOut, updateProfile, user, verifyEmailOtp]);

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
