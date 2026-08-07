import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertCircle, Sparkles } from 'lucide-react';
import { ConnectEmbed } from 'thirdweb/react';
import type { ThirdwebClient } from 'thirdweb';
import { useAuth } from '@/providers/AuthProvider';
import { AnimatedLogo } from '@/components/ui/animated-logo';
import { Button } from '@/components/ui/button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { getThirdwebClient } from '@/lib/thirdweb/client';
import { createThirdwebWallets } from '@/lib/thirdweb/wallets';
import { wzrdTheme } from '@/lib/thirdweb/theme';
import { appRoutes, resolvePostLoginPath } from '@/lib/routes';
import {
  clearDesktopThirdwebAuthNext,
  consumeDesktopThirdwebAuthNext,
  getDesktopThirdwebAuthReturnUrl,
  rememberDesktopThirdwebAuthNext,
} from '@/lib/desktop';
import {
  getThirdwebAuthCallbackIssue,
  stripThirdwebAuthCallbackParams,
} from '@/lib/thirdweb/auth-callback';

const ambientParticles = [
  { left: '13%', top: '22%', delay: 0.2, duration: 5.8, tone: 'primary' },
  { left: '24%', top: '74%', delay: 1.1, duration: 7.2, tone: 'secondary' },
  { left: '39%', top: '16%', delay: 2.4, duration: 6.4, tone: 'primary' },
  { left: '58%', top: '82%', delay: 0.7, duration: 7.8, tone: 'secondary' },
  { left: '72%', top: '28%', delay: 1.8, duration: 6.8, tone: 'primary' },
  { left: '86%', top: '63%', delay: 2.9, duration: 5.9, tone: 'secondary' },
];

function getCallbackError(hash: string, search: string): string | null {
  for (const rawParams of [hash, search]) {
    if (!rawParams) continue;

    const params = new URLSearchParams(rawParams.startsWith('#') || rawParams.startsWith('?') ? rawParams.slice(1) : rawParams);
    const message = params.get('error_description') ?? params.get('error') ?? params.get('error_code');

    if (message) {
      return message;
    }
  }

  return null;
}

function formatThirdwebAuthError(message: string | null): string | null {
  if (!message) {
    return null;
  }

  const normalizedMessage = message.toLowerCase();
  if (
    normalizedMessage.includes('unsupported provider') ||
    normalizedMessage.includes('provider is not enabled') ||
    normalizedMessage.includes('validation_failed')
  ) {
    return 'This thirdweb sign-in method is not enabled yet. Enable it in the thirdweb dashboard or choose another thirdweb option.';
  }

  return message;
}

const Login = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, authenticateWallet, isWalletAuthenticating, walletAuthError } = useAuth();
  const [thirdwebClient, setThirdwebClient] = useState<ThirdwebClient | null>(null);
  const [configError, setConfigError] = useState<string | null>(null);
  const [callbackError, setCallbackError] = useState<string | null>(null);
  const nextFromQuery = useMemo(() => new URLSearchParams(location.search).get('next'), [location.search]);
  const callbackIssue = useMemo(() => getThirdwebAuthCallbackIssue(location.search), [location.search]);
  const thirdwebCallbackError = useMemo(
    () => getCallbackError(location.hash, location.search),
    [location.hash, location.search],
  );
  const loginWallets = useMemo(
    () =>
      createThirdwebWallets({
        desktopAuthReturnUrl: getDesktopThirdwebAuthReturnUrl(),
      }),
    [],
  );

  useEffect(() => {
    if (nextFromQuery) {
      rememberDesktopThirdwebAuthNext(nextFromQuery);
    }
  }, [nextFromQuery]);

  useEffect(() => {
    getThirdwebClient()
      .then(setThirdwebClient)
      .catch((err) => {
        console.error('Failed to load Thirdweb client:', err);
        setConfigError(err instanceof Error ? err.message : String(err));
      });
  }, []);

  useEffect(() => {
    if (!callbackIssue) {
      return;
    }

    clearDesktopThirdwebAuthNext();
    setCallbackError(callbackIssue.message);

    const nextSearch = stripThirdwebAuthCallbackParams(location.search);
    navigate(`${location.pathname}${nextSearch}${location.hash}`, { replace: true });
  }, [callbackIssue, location.hash, location.pathname, location.search, navigate]);

  // Only redirect once a real Supabase session exists.
  // Connecting a wallet alone is not enough: wallet-auth must complete first.
  useEffect(() => {
    if (user) {
      navigate(resolvePostLoginPath(nextFromQuery, consumeDesktopThirdwebAuthNext() ?? appRoutes.home), { replace: true });
    }
  }, [user, navigate, nextFromQuery]);

  const handleWalletRetry = async () => {
    await authenticateWallet();
  };

  const authCallbackError = formatThirdwebAuthError(
    callbackError ?? callbackIssue?.message ?? thirdwebCallbackError,
  );
  const formattedWalletAuthError = formatThirdwebAuthError(walletAuthError);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#030405] px-4 py-10 text-white">
      <div className="absolute inset-0">
        <div
          className="absolute left-1/2 top-[-24%] h-[620px] w-[960px] -translate-x-1/2 rounded-full opacity-[0.16] blur-[130px]"
          style={{
            background:
              'radial-gradient(circle, rgba(255,107,74,0.95) 0%, rgba(45,212,191,0.24) 42%, transparent 76%)',
          }}
        />
        <div
          className="absolute inset-0 opacity-[0.045]"
          style={{
            backgroundImage: 'radial-gradient(rgba(255,255,255,0.32) 1px, transparent 1px)',
            backgroundSize: '30px 30px',
          }}
        />
      </div>

      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {ambientParticles.map((particle) => (
          <motion.div
            key={`${particle.left}-${particle.top}`}
            className="absolute h-[2px] w-[2px] rounded-full"
            style={{
              left: particle.left,
              top: particle.top,
              backgroundColor:
                particle.tone === 'primary' ? 'hsl(var(--glow-primary))' : 'rgb(45 212 191)',
            }}
            animate={{ y: [0, -18, 0], opacity: [0.2, 0.55, 0.2] }}
            transition={{
              duration: particle.duration,
              repeat: Infinity,
              ease: 'easeInOut',
              delay: particle.delay,
            }}
          />
        ))}
      </div>

      <motion.main
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.48, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.035] shadow-[0_30px_110px_-28px_rgba(0,0,0,0.9)] backdrop-blur-2xl lg:grid-cols-[0.92fr_1.08fr]"
      >
        <section className="hidden min-h-[620px] border-r border-white/[0.07] bg-black/25 p-8 lg:flex lg:flex-col lg:justify-between">
          <div>
            <AnimatedLogo size="lg" showVersion={true} autoplay={true} delay={0.3} />
            <div className="mt-10 inline-flex items-center gap-2 rounded-full border border-orange-400/20 bg-orange-400/10 px-3 py-1.5 text-xs font-medium text-orange-200">
              <Sparkles className="h-3.5 w-3.5" />
              Cinematic AI production suite
            </div>
            <h1 className="mt-5 max-w-sm text-4xl font-semibold leading-tight tracking-normal text-white">
              Sign in and keep the creative timeline moving.
            </h1>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-black/30 p-4">
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 text-xs text-white/45">
              <span>Studio status</span>
              <span className="inline-flex items-center gap-1.5 text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" />
                Ready
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              {[
                ['200+', 'models'],
                ['4K', 'exports'],
                ['Live', 'sync'],
              ].map(([value, label]) => (
                <div key={label} className="rounded-lg bg-white/[0.04] px-3 py-3">
                  <div className="text-lg font-semibold text-white">{value}</div>
                  <div className="mt-1 text-[11px] uppercase tracking-wide text-white/35">{label}</div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-5 py-8 sm:px-8 lg:px-10">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8 flex flex-col items-center text-center lg:hidden">
              <AnimatedLogo size="lg" showVersion={true} autoplay={true} delay={0.3} />
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-[0.22em] text-orange-300/80">WZRD Studio</p>
              <h2 className="text-3xl font-semibold tracking-normal text-white">Sign in</h2>
              <p className="text-sm leading-6 text-white/50">
                Welcome back to the cinematic AI production suite.
              </p>
            </div>

            {authCallbackError ? (
              <div className="mt-6 flex gap-3 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-3 text-sm text-red-200">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{authCallbackError}</span>
              </div>
            ) : null}

            <div className="mt-7 rounded-xl border border-white/[0.08] bg-black/30 p-3">
              {configError ? (
                <div className="px-2 py-4 text-center">
                  <p className="text-sm text-red-200">thirdweb sign-in is unavailable.</p>
                  <p className="mt-2 text-xs text-white/45">{configError}</p>
                </div>
              ) : !thirdwebClient ? (
                <div className="flex justify-center py-8">
                  <LoadingSpinner size="lg" />
                </div>
              ) : (
                <>
                  <ConnectEmbed
                    client={thirdwebClient}
                    wallets={loginWallets}
                    theme={wzrdTheme}
                    modalSize="compact"
                    showThirdwebBranding={false}
                    className="!w-full !bg-transparent !border-0"
                    header={{ title: 'Sign in with thirdweb' }}
                  />
                  {isWalletAuthenticating ? (
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-white/45">
                      <LoadingSpinner size="sm" />
                      <span>Verifying wallet signature...</span>
                    </div>
                  ) : null}
                  {formattedWalletAuthError ? (
                    <div className="mt-4 rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-3 text-center">
                      <p className="text-xs text-red-200">{formattedWalletAuthError}</p>
                      <div className="mt-3 flex justify-center">
                        <Button
                          type="button"
                          onClick={handleWalletRetry}
                          disabled={isWalletAuthenticating}
                          className="h-9 rounded-md bg-white/10 px-3 text-xs text-white hover:bg-white/15"
                        >
                          Retry sign-in
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </>
              )}
            </div>

            <p className="mt-6 text-center text-xs leading-5 text-white/35">
              By continuing, you agree to the WZRD Studio Terms of Service.
            </p>
          </div>
        </section>
      </motion.main>
    </div>
  );
};

export default Login;
