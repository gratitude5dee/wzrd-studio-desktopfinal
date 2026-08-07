import { useState } from 'react';

import { ResourceClassPicker } from '@/features/qcut-sandbox/components/ResourceClassPicker';
import { SessionHeader } from '@/features/qcut-sandbox/components/SessionHeader';
import { TerminalView } from '@/features/qcut-sandbox/components/TerminalView';
import { useSpawnSandbox } from '@/features/qcut-sandbox/hooks/useSpawnSandbox';
import type { ResourceClass } from '@/features/qcut-sandbox/api/sandbox-client';

/**
 * Reads the QCut session token. v0 stash: localStorage under
 * `qcut_auth_token`. Replace with whatever auth store the rest of the
 * app uses once we wire QCut sign-in into WZRD Studio.
 */
function useQcutAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem('qcut_auth_token');
}

export default function SandboxPage() {
  const qcutAuthToken = useQcutAuthToken();
  const spawn = useSpawnSandbox();
  const [exitReason, setExitReason] = useState<string | null>(null);
  const [resourceClass, setResourceClass] = useState<ResourceClass>('standard');

  if (!qcutAuthToken) {
    return (
      <div className="p-8 text-amber-600">
        Not signed in to QCut. Run <code>qcut system login</code> on your machine and paste the value of{' '}
        <code>QCUT_AUTH_TOKEN</code> from <code>~/.qcut/.env</code> into localStorage as{' '}
        <code>qcut_auth_token</code>, then refresh.
      </div>
    );
  }

  if (!spawn.data || exitReason) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8">
        {exitReason ? <p className="text-amber-600">session ended: {exitReason}</p> : null}
        <ResourceClassPicker value={resourceClass} onChange={setResourceClass} />
        <button
          type="button"
          className="rounded bg-orange-500 px-4 py-2 text-white"
          disabled={spawn.isPending}
          onClick={() => {
            setExitReason(null);
            spawn.mutate({
              qcutAuthToken,
              resource_class: resourceClass,
            });
          }}
        >
          {spawn.isPending ? 'Spawning…' : 'Open qcut shell'}
        </button>
        {spawn.error ? <p className="text-red-500">{spawn.error.message}</p> : null}
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <SessionHeader
        sessionId={spawn.data.session_id}
        expiresAt={spawn.data.expires_at}
        onStop={() => setExitReason('user_kill')}
      />
      <div className="flex-1">
        <TerminalView wsUrl={spawn.data.ws_url} onExit={setExitReason} />
      </div>
    </div>
  );
}
