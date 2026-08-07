
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import type { User, Session } from '@supabase/supabase-js';
import { useActiveAccount } from 'thirdweb/react';
import type { Account } from 'thirdweb/wallets';
import { clearDesktopThirdwebAuthNext, getStoredDesktopThirdwebAuthNext } from '@/lib/desktop';
import { appRoutes, sanitizeNextPath } from '@/lib/routes';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  thirdwebAccount: Account | undefined;
  loading: boolean;
  isAuthenticated: boolean;
  authenticateWallet: () => Promise<boolean>;
  isWalletAuthenticating: boolean;
  walletAuthError: string | null;
}

const AuthContext = createContext<AuthContextType>({ 
  user: null, 
  session: null,
  thirdwebAccount: undefined,
  loading: true,
  isAuthenticated: false,
  authenticateWallet: async () => false,
  isWalletAuthenticating: false,
  walletAuthError: null,
});

// SECURITY: Auth bypass is ONLY available in development builds.
// import.meta.env.DEV is false in production bundles, so this code is dead-code-eliminated.
const bypassAuthForTests = import.meta.env.DEV &&
  import.meta.env.VITE_BYPASS_AUTH_FOR_TESTS === 'true';
const BYPASS_AUTH_TEST_USER_ID = '00000000-0000-4000-8000-000000000001';

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function getFunctionErrorMessage(error: unknown): Promise<string> {
  const fallback = getErrorMessage(error);
  const context = error && typeof error === 'object' && 'context' in error
    ? (error as { context?: unknown }).context
    : null;

  if (context && typeof (context as Response).clone === 'function') {
    try {
      const response = (context as Response).clone();
      const contentType = response.headers.get('content-type') ?? '';

      if (contentType.includes('application/json')) {
        const payload = await response.json();
        if (payload && typeof payload === 'object') {
          const message =
            typeof payload.error === 'string' ? payload.error :
            typeof payload.message === 'string' ? payload.message :
            typeof payload.details === 'string' ? payload.details :
            null;

          if (message) {
            return message;
          }
        }
      }

      const text = await response.text();
      if (text.trim()) {
        return text.trim();
      }
    } catch {
      // Fall through to the SDK message below.
    }
  }

  return fallback === 'Edge Function returned a non-2xx status code'
    ? 'Wallet sign-in could not be completed. Try again or use Google/email.'
    : fallback;
}

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isWalletAuthenticating, setIsWalletAuthenticating] = useState(false);
  const [walletAuthError, setWalletAuthError] = useState<string | null>(null);
  // Tracks the last wallet address that failed bootstrap so we don't infinite-retry.
  const failedWalletRef = useRef<string | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  
  // Get thirdweb account from their hook
  const thirdwebAccount = useActiveAccount();
  
  // User is authenticated if Supabase user exists (wallet auth now creates Supabase users)
  const isAuthenticated = !!user;

  const getPostLoginPath = useCallback(() => {
    const nextFromQuery = new URLSearchParams(location.search).get('next');
    const nextFromState =
      typeof location.state === 'object' && location.state && 'from' in location.state
        ? (location.state as { from?: { pathname?: string; search?: string; hash?: string } }).from
        : undefined;

    const nextFromStatePath = nextFromState?.pathname
      ? `${nextFromState.pathname}${nextFromState.search ?? ''}${nextFromState.hash ?? ''}`
      : null;

    return (
      sanitizeNextPath(nextFromQuery) ??
      sanitizeNextPath(nextFromStatePath) ??
      getStoredDesktopThirdwebAuthNext() ??
      appRoutes.home
    );
  }, [location.search, location.state]);

  const navigateToPostLoginPath = useCallback(() => {
    const postLoginPath = getPostLoginPath();
    clearDesktopThirdwebAuthNext();
    navigate(postLoginPath, { replace: true });
  }, [getPostLoginPath, navigate]);

  // Function to authenticate wallet with Supabase
  const authenticateWallet = useCallback(async (): Promise<boolean> => {
    if (!thirdwebAccount?.address) {
      setWalletAuthError('No wallet connected');
      return false;
    }

    const walletAddress = thirdwebAccount.address;
    const walletAddressLower = walletAddress.toLowerCase();
    const failWalletAuth = (message: string) => {
      setWalletAuthError(message);
      failedWalletRef.current = walletAddressLower;
      return false;
    };

    // If already authenticated with same wallet, skip
    if (user?.user_metadata?.wallet_address?.toLowerCase() === walletAddressLower) {
      return true;
    }

    setIsWalletAuthenticating(true);
    setWalletAuthError(null);
    failedWalletRef.current = null;

    try {
      const timestamp = Date.now();
      const message = `Sign this message to authenticate with MOG Studio.\n\nWallet: ${walletAddress}\nTimestamp: ${timestamp}\n\nThis signature proves you own this wallet and does not authorize any transactions.`;

      // Sign the message using Thirdweb
      let signature: string;
      try {
        signature = await thirdwebAccount.signMessage({ message });
      } catch (signError: unknown) {
        const signErrorMessage = getErrorMessage(signError);
        if (signErrorMessage.includes('rejected') || signErrorMessage.includes('denied')) {
          return failWalletAuth('Signature request was rejected');
        }
        throw signError;
      }

      // Call the wallet-auth edge function
      const { data, error: fnError } = await supabase.functions.invoke('wallet-auth', {
        body: {
          walletAddress,
          message,
          signature,
          timestamp,
        },
      });

      if (fnError) {
        console.error('Wallet auth function error:', fnError);
        return failWalletAuth(await getFunctionErrorMessage(fnError));
      }

      if (!data?.session) {
        return failWalletAuth('No session returned from authentication');
      }

      // Set the Supabase session
      const { error: sessionError } = await supabase.auth.setSession({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });

      if (sessionError) {
        console.error('Error setting session:', sessionError);
        return failWalletAuth('Failed to establish session');
      }

      failedWalletRef.current = null;
      return true;
    } catch (err: unknown) {
      console.error('Wallet authentication error:', err);
      return failWalletAuth(getErrorMessage(err) || 'Authentication failed');
    } finally {
      setIsWalletAuthenticating(false);
    }
  }, [thirdwebAccount, user]);

  useEffect(() => {
    if (bypassAuthForTests) {
      setUser({
        id: BYPASS_AUTH_TEST_USER_ID,
        aud: 'authenticated',
        email: 'asset-tests@local.dev',
        phone: '',
        app_metadata: {},
        user_metadata: {},
        created_at: new Date().toISOString(),
        role: 'authenticated',
        last_sign_in_at: new Date().toISOString(),
        factors: [],
      } as unknown as User);
      setLoading(false);
      return;
    }

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      
      // If user just logged in and they're on the login page, redirect them
      if (session?.user && location.pathname === appRoutes.login) {
        navigateToPostLoginPath();
      }
    });

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [navigateToPostLoginPath, location.pathname]);

  // Auto-authenticate wallet when connected and no Supabase session exists.
  // One-shot guard: don't retry the same wallet on every render after a failure.
  useEffect(() => {
    if (!thirdwebAccount || user || loading || isWalletAuthenticating) return;
    // Skip if we already failed for this exact wallet — wait for the user to retry.
    if (failedWalletRef.current === thirdwebAccount.address.toLowerCase()) return;

    authenticateWallet().then(success => {
      if (success) {
        if (location.pathname === appRoutes.login) {
          navigateToPostLoginPath();
        }
      } else {
        // Mark this wallet as failed so we don't loop. Stay on /login.
        failedWalletRef.current = thirdwebAccount.address.toLowerCase();
      }
    });
  }, [thirdwebAccount, user, loading, isWalletAuthenticating, authenticateWallet, location.pathname, navigateToPostLoginPath]);

  return (
    <AuthContext.Provider value={{
      user,
      session,
      thirdwebAccount,
      // Do NOT include isWalletAuthenticating here — ProtectedRoute would hang.
      // Login screen reads isWalletAuthenticating directly to show its own UI.
      loading,
      isAuthenticated,
      authenticateWallet,
      isWalletAuthenticating,
      walletAuthError,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
