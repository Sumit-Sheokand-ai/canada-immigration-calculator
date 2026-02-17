import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getSupabaseClient, isSupabaseConfigured } from '../utils/supabaseClient';

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
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const mountedRef = useRef(true);
  const authSubscriptionRef = useRef(null);
  const hydratePromiseRef = useRef(null);

  const applySessionState = useCallback((nextSession) => {
    setSession(nextSession || null);
    setUser(nextSession?.user || null);
  }, []);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      authSubscriptionRef.current?.unsubscribe?.();
      authSubscriptionRef.current = null;
    };
  }, []);

  const ensureAuthReady = useCallback(async () => {
    if (!isSupabaseConfigured) return null;
    if (hydratePromiseRef.current) return hydratePromiseRef.current;

    hydratePromiseRef.current = (async () => {
      const client = await getSupabaseClient();
      if (!client) return null;

      if (!authSubscriptionRef.current) {
        const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
          if (!mountedRef.current) return;
          applySessionState(nextSession || null);
        });
        authSubscriptionRef.current = data?.subscription || null;
      }

      if (mountedRef.current) setLoading(true);
      try {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        if (mountedRef.current) {
          applySessionState(data.session || null);
        }
      } finally {
        if (mountedRef.current) setLoading(false);
      }

      return client;
    })().finally(() => {
      hydratePromiseRef.current = null;
    });

    return hydratePromiseRef.current;
  }, [applySessionState]);

  const requireClient = useCallback(async () => {
    if (!isSupabaseConfigured) {
      throw new Error('Supabase auth is not configured.');
    }
    const client = await ensureAuthReady();
    if (!client) {
      throw new Error('Supabase auth is not configured.');
    }
    return client;
  }, [ensureAuthReady]);

  const sendEmailMagicLink = useCallback(async (email) => {
    const client = await requireClient();
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: getRedirectTo(),
      },
    });
    if (error) throw error;
    return { status: 'sent' };
  }, [requireClient]);

  const sendEmailOtp = useCallback(async (email) => {
    return sendEmailMagicLink(email);
  }, [sendEmailMagicLink]);

  const verifyEmailOtp = useCallback(async (email, token) => {
    const client = await requireClient();
    const possibleTypes = ['email', 'magiclink', 'signup'];
    let lastError = null;
    for (const type of possibleTypes) {
      const { data, error } = await client.auth.verifyOtp({ email, token, type });
      if (!error) return data;
      lastError = error;
    }
    throw lastError || new Error('Unable to verify the email code.');
  }, [requireClient]);

  const signInWithGoogle = useCallback(async () => {
    const client = await requireClient();
    const { error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: getRedirectTo(),
      },
    });
    if (error) throw error;
    return { status: 'redirecting' };
  }, [requireClient]);

  const signOut = useCallback(async () => {
    const client = await ensureAuthReady();
    if (!client) return;
    const { error } = await client.auth.signOut();
    if (error) throw error;
  }, [ensureAuthReady]);

  const updateProfile = useCallback(async ({ fullName }) => {
    const client = await requireClient();
    const payload = {};
    if (typeof fullName === 'string') {
      payload.data = { full_name: fullName.trim() };
    }
    const { data, error } = await client.auth.updateUser(payload);
    if (error) throw error;
    if (data?.user) {
      setUser(data.user);
    }
    return data;
  }, [requireClient]);

  const changePassword = useCallback(async (password) => {
    const client = await requireClient();
    const nextPassword = String(password || '');
    if (nextPassword.length < 8) {
      throw new Error('Password must be at least 8 characters.');
    }
    const { data, error } = await client.auth.updateUser({ password: nextPassword });
    if (error) throw error;
    if (data?.user) {
      setUser(data.user);
    }
    return data;
  }, [requireClient]);

  const deleteAccount = useCallback(async () => {
    const client = await requireClient();

    const functionName = import.meta.env.VITE_SUPABASE_DELETE_ACCOUNT_FUNCTION || 'delete-account';
    const { data, error } = await client.functions.invoke(functionName, {
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

    await client.auth.signOut();
    setSession(null);
    setUser(null);
    return data;
  }, [requireClient]);

  const refreshSession = useCallback(async () => {
    const client = await ensureAuthReady();
    if (!client) {
      return null;
    }
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    applySessionState(data.session || null);
    return data.session || null;
  }, [applySessionState, ensureAuthReady]);

  const value = useMemo(() => ({
    isConfigured: isSupabaseConfigured,
    loading,
    session,
    user,
    isAuthenticated: !!user,
    sendEmailOtp,
    sendEmailMagicLink,
    verifyEmailOtp,
    ensureAuthReady,
    signInWithGoogle,
    signOut,
    updateProfile,
    changePassword,
    deleteAccount,
    refreshSession,
  }), [changePassword, deleteAccount, ensureAuthReady, loading, refreshSession, sendEmailMagicLink, sendEmailOtp, session, signInWithGoogle, signOut, updateProfile, user, verifyEmailOtp]);

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
