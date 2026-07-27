import React, { createContext, useContext, useEffect, useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { VoiceActionButton } from '@/components/voice/VoiceActionButton';
import { useAuth } from '@/providers/AuthProvider';

import { createGlobalVoiceActions } from './actions/navigation';
import {
  createVoiceActionRegistry,
  type VoiceActionName,
  type VoiceActionRegistration,
  type VoiceActionResult,
  type VoiceActionRegistry,
} from './actions/registry';
import { useWzrdRealtimeSession } from './realtime/useWzrdRealtimeSession';
import { VoiceSelectionProvider } from './VoiceSelectionContext';

declare global {
  interface Window {
    __wzrdVoiceActionTest?: {
      execute: (
        name: VoiceActionName,
        input?: Record<string, unknown>,
        options?: { confirmed?: boolean },
      ) => Promise<VoiceActionResult>;
    };
  }
}

const VoiceAgentContext = createContext<VoiceActionRegistry | null>(null);

function getProjectIdFromPath(pathname: string): string | null {
  const match = pathname.match(/^\/projects\/([^/]+)/);
  return match?.[1] ?? null;
}

function shouldShowVoiceControl(pathname: string, isAuthenticated: boolean): boolean {
  if (!isAuthenticated) return false;
  return pathname !== '/' && pathname !== '/login';
}

export function useVoiceActionRegistry(): VoiceActionRegistry {
  const registry = useContext(VoiceAgentContext);
  if (!registry) {
    throw new Error('useVoiceActionRegistry must be used within VoiceAgentProvider');
  }
  return registry;
}

export function useRegisterVoiceActions(registrations: VoiceActionRegistration[]) {
  const registry = useContext(VoiceAgentContext);

  useEffect(() => {
    if (!registry) return;
    const unregister = registrations.map((registration) => registry.register(registration));
    return () => {
      unregister.forEach((fn) => fn());
    };
  }, [registry, registrations]);
}

export function VoiceAgentProvider({ children }: { children: React.ReactNode }) {
  const registry = useMemo(() => createVoiceActionRegistry(), []);
  const navigate = useNavigate();
  const location = useLocation();
  const { isAuthenticated } = useAuth();

  const globalActions = useMemo(
    () =>
      createGlobalVoiceActions({
        navigate,
        getLocationPath: () => `${location.pathname}${location.search}`,
        getCurrentProjectId: () => getProjectIdFromPath(location.pathname),
        getAvailableActionNames: () =>
          Array.from(new Set(registry.list().map((registration) => registration.name))).sort(),
      }),
    [location.pathname, location.search, navigate, registry],
  );

  useEffect(() => {
    const unregister = globalActions.map((registration) => registry.register(registration));
    return () => unregister.forEach((fn) => fn());
  }, [globalActions, registry]);

  useEffect(() => {
    if (!(import.meta.env.DEV && import.meta.env.VITE_BYPASS_AUTH_FOR_TESTS === 'true')) {
      return;
    }

    window.__wzrdVoiceActionTest = {
      execute: (name, input = {}, options = {}) =>
        registry.execute(name, input, { confirmed: options.confirmed }),
    };

    return () => {
      delete window.__wzrdVoiceActionTest;
    };
  }, [registry]);

  const voiceSession = useWzrdRealtimeSession({ registry });
  const showVoiceControl = shouldShowVoiceControl(location.pathname, isAuthenticated);

  return (
    <VoiceAgentContext.Provider value={registry}>
      <VoiceSelectionProvider>
      {children}
      {showVoiceControl ? (
        <VoiceActionButton
          status={voiceSession.status}
          errorMessage={voiceSession.errorMessage}
          pendingConfirmation={voiceSession.pendingConfirmation}
          lastTranscript={voiceSession.lastTranscript}
          lastActionMessage={voiceSession.lastActionMessage}
          lastTraceId={voiceSession.lastTraceId}
          onPressStart={voiceSession.pushToTalkStart}
          onPressEnd={voiceSession.pushToTalkStop}
          onDisconnect={voiceSession.disconnect}
          onConfirm={voiceSession.confirmPendingAction}
          onCancel={voiceSession.cancelPendingAction}
        />
      ) : null}
      </VoiceSelectionProvider>
    </VoiceAgentContext.Provider>
  );
}
