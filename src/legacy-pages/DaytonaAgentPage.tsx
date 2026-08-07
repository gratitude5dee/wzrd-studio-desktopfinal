import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Cable, RotateCcw } from 'lucide-react';

import { Sidebar } from '@/components/home/Sidebar';
import { MobileBottomNav } from '@/components/home/MobileBottomNav';
import { Button } from '@/components/ui/button';
import { AgentFileBrowser } from '@/components/daytona-agent/AgentFileBrowser';
import { AgentSessionStatus } from '@/components/daytona-agent/AgentSessionStatus';
import { AgentTerminal } from '@/components/daytona-agent/AgentTerminal';
import { AgentUploadPanel } from '@/components/daytona-agent/AgentUploadPanel';
import { useSidebar } from '@/contexts/SidebarContext';
import { useDaytonaAgentFiles } from '@/hooks/daytona-agent/useDaytonaAgentFiles';
import { useDaytonaAgentSession } from '@/hooks/daytona-agent/useDaytonaAgentSession';
import { useDaytonaTerminalSocket } from '@/hooks/daytona-agent/useDaytonaTerminalSocket';
import { useIsMobile } from '@/hooks/use-mobile';
import { appRoutes } from '@/lib/routes';

export default function DaytonaAgentPage() {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const isMobile = useIsMobile();
  const { isCollapsed } = useSidebar();

  const handleHomeViewChange = useCallback(
    (view: string) => {
      navigate(appRoutes.home, { state: { activeView: view } });
    },
    [navigate],
  );

  const handleCreateProject = useCallback(() => {
    navigate(appRoutes.projectSetup);
  }, [navigate]);

  const sessionState = useDaytonaAgentSession({ projectId: projectId ?? null });
  const terminal = useDaytonaTerminalSocket();
  const filesState = useDaytonaAgentFiles({ sessionId: sessionState.session?.id });
  const [terminalExit, setTerminalExit] = useState('');

  const { session, setSession, isLoading, createSession, stopSession } = sessionState;
  const { wsUrl, isConnecting, connect, disconnect } = terminal;
  const {
    files,
    path,
    isLoading: isFilesLoading,
    isUploading,
    error: filesError,
    refresh: refreshFiles,
    upload: uploadFile,
    download: downloadFile,
  } = filesState;

  useEffect(() => {
    if (session?.status === 'ready' && !wsUrl && !isConnecting) {
      setTerminalExit('');
      void connect({ session })
        .then((result) => {
          setSession(result.session);
        })
        .catch(() => {});
    }
  }, [connect, isConnecting, session, setSession, wsUrl]);

  useEffect(() => {
    if (session?.id) {
      void refreshFiles();
    }
  }, [refreshFiles, session?.id]);

  const reconnect = useCallback(async () => {
    setTerminalExit('');
    if (!session) return;
    const result = await connect({ session });
    setSession(result.session);
  }, [connect, session, setSession]);

  const handleTerminalOpen = useCallback(() => {
    setTerminalExit('');
  }, []);

  const handleTerminalExit = useCallback(
    (reason: string) => {
      disconnect();
      setTerminalExit(reason);
    },
    [disconnect],
  );

  const error = sessionState.error || terminal.error || filesError;

  return (
    <div className="min-h-screen bg-[#08090d]">
      <div className="hidden md:block">
        <Sidebar activeView="agent" onViewChange={handleHomeViewChange} />
      </div>

      <motion.div
        className="min-h-screen pb-20 md:pb-0"
        animate={{ marginLeft: isMobile ? 0 : isCollapsed ? 64 : 256 }}
        transition={{ type: 'spring', stiffness: 300, damping: 30 }}
        initial={false}
      >
        <div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100">
          <AgentSessionStatus
            session={sessionState.session}
            isLoading={isLoading}
            onRefresh={() => void createSession({ forceNew: false })}
            onStop={() => {
              disconnect();
              void stopSession();
            }}
          />
          <main className="grid flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,1fr)_360px]">
            <section className="flex min-h-[520px] flex-col">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div>
                  <h1 className="text-base font-semibold text-white">WZRD Daytona Agent</h1>
                  <p className="text-sm text-zinc-400">
                    {projectId ? `Project ${projectId.slice(0, 8)}` : 'Global agent workspace'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" disabled={!session || isConnecting} onClick={reconnect}>
                    <Cable className="mr-2 h-4 w-4" aria-hidden="true" />
                    Connect
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={isLoading}
                    onClick={() => void createSession({ forceNew: true })}
                  >
                    <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                    New
                  </Button>
                </div>
              </div>

              {error ? (
                <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-200">{error}</div>
              ) : null}
              {terminalExit && !wsUrl ? (
                <div className="border-b border-amber-500/30 bg-amber-500/10 px-4 py-2 text-sm text-amber-200">
                  terminal disconnected: {terminalExit}
                </div>
              ) : null}

              <div className="flex-1 overflow-hidden">
                {wsUrl ? (
                  <AgentTerminal wsUrl={wsUrl} onOpen={handleTerminalOpen} onExit={handleTerminalExit} />
                ) : (
                  <div className="flex h-full min-h-[420px] items-center justify-center text-sm text-zinc-500">
                    {isLoading || isConnecting ? 'Preparing Daytona agent...' : 'Connect to open the agent terminal.'}
                  </div>
                )}
              </div>
            </section>

            <aside className="flex min-h-[420px] flex-col">
              <div className="flex items-center justify-between border-b border-white/10 bg-zinc-950 px-3 py-2">
                <AgentUploadPanel
                  disabled={!sessionState.session || isFilesLoading}
                  isUploading={isUploading}
                  onUpload={(file) => void uploadFile(file)}
                />
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => void refreshFiles()}
                  disabled={!sessionState.session || isFilesLoading}
                >
                  Refresh
                </Button>
              </div>

              <AgentFileBrowser
                files={files}
                path={path}
                isLoading={isFilesLoading}
                onRefresh={() => void refreshFiles()}
                onDownload={(filename) => void downloadFile(filename)}
              />
            </aside>
          </main>
        </div>
      </motion.div>

      <MobileBottomNav activeView="agent" onViewChange={handleHomeViewChange} onCreateProject={handleCreateProject} />
    </div>
  );
}
