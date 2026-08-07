import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { ThirdwebProvider } from 'thirdweb/react';
import { AuthProvider } from '@/providers/AuthProvider';
import ProtectedRoute from '@/components/ProtectedRoute';
import ProjectAccessGate from '@/components/ProjectAccessGate';
import PerfShell from '@/components/perf/PerfShell';
import { StudioErrorBoundary } from '@/components/studio/StudioErrorBoundary';
import CustomCursor from '@/components/CustomCursor';
import { CursorLoadingProvider, useCursorLoading } from '@/contexts/CursorLoadingContext';
import { SidebarProvider } from '@/contexts/SidebarContext';
import { InsufficientCreditsDialog } from '@/components/billing/InsufficientCreditsDialog';
import { VoiceAgentProvider } from '@/voice/VoiceAgentProvider';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { appRoutes } from '@/lib/routes';

// Retry a dynamic import once; on stale chunk hash, force a single hard reload.
const RELOAD_FLAG = '__lov_chunk_reloaded__';
const lazyWithRetry = <T extends { default: React.ComponentType<Record<string, never>> }>(
  importer: () => Promise<T>,
) =>
  lazy(async () => {
    try {
      return await importer();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      const isChunkError =
        /Failed to fetch dynamically imported module|Importing a module script failed|ChunkLoadError/i.test(msg);
      if (isChunkError && typeof window !== 'undefined') {
        if (!sessionStorage.getItem(RELOAD_FLAG)) {
          sessionStorage.setItem(RELOAD_FLAG, '1');
          window.location.reload();
          return new Promise<T>(() => {});
        }
        sessionStorage.removeItem(RELOAD_FLAG);
      }
      throw err;
    }
  });

const Home = lazyWithRetry(() => import('@/legacy-pages/Home'));
const SettingsPage = lazyWithRetry(() => import('@/legacy-pages/SettingsPage'));
const SettingsBillingPage = lazyWithRetry(() => import('@/legacy-pages/SettingsBillingPage'));
const SettingsBillingDocsPage = lazyWithRetry(() => import('@/legacy-pages/SettingsBillingDocsPage'));
const ProjectSetup = lazyWithRetry(() => import('@/legacy-pages/ProjectSetup'));
const StudioPage = lazyWithRetry(() => import('@/legacy-pages/StudioPage'));
const LearningStudioPage = lazyWithRetry(() => import('@/legacy-pages/LearningStudioPage'));
const StoryboardPage = lazyWithRetry(() => import('@/legacy-pages/StoryboardPage'));
const ProjectObservabilityPage = lazyWithRetry(() => import('@/legacy-pages/ProjectObservabilityPage'));
const DirectorCutPage = lazyWithRetry(() => import('@/legacy-pages/DirectorCutPage'));
const EditorPage = lazyWithRetry(() => import('@/legacy-pages/EditorPage'));
const Storyboard = lazyWithRetry(() => import('@/legacy-pages/Storyboard'));
const ShotEditor = lazyWithRetry(() => import('@/legacy-pages/ShotEditor'));
const KanvasPage = lazyWithRetry(() => import('@/legacy-pages/KanvasPage'));
const KanvasLyrics = lazyWithRetry(() => import('@/legacy-pages/KanvasLyrics'));
const KanvasRemix = lazyWithRetry(() => import('@/legacy-pages/KanvasRemix'));
const KanvasRemixJobs = lazyWithRetry(() => import('@/legacy-pages/KanvasRemixJobs'));
const Clipper = lazyWithRetry(() => import('@/legacy-pages/Clipper'));
const Sourcify = lazyWithRetry(() => import('@/legacy-pages/Sourcify'));
const Postz = lazyWithRetry(() => import('@/legacy-pages/Postz'));
const IPVault = lazyWithRetry(() => import('@/legacy-pages/IPVault'));
const NotFound = lazyWithRetry(() => import('@/legacy-pages/NotFound'));

const CursorWrapper = () => {
  const { isLoading } = useCursorLoading();
  return <CustomCursor isLoading={isLoading} />;
};

const StudioRootRoute = () => {
  const location = useLocation();
  const isNodePopulationE2E =
    import.meta.env.DEV &&
    import.meta.env.VITE_BYPASS_AUTH_FOR_TESTS === 'true' &&
    new URLSearchParams(location.search).get('e2e') === 'node-population';
  return isNodePopulationE2E ? <StudioPage /> : <Navigate to={appRoutes.home} replace />;
};

const RedirectProjectTimelineAlias = () => {
  const { projectId } = useParams();
  return projectId ? <Navigate to={appRoutes.projects.timeline(projectId)} replace /> : <Navigate to={appRoutes.home} replace />;
};

const RedirectLegacyStudioProject = () => {
  const { projectId } = useParams();
  return projectId ? <Navigate to={appRoutes.projects.studio(projectId)} replace /> : <Navigate to={appRoutes.home} replace />;
};

const RedirectLegacyTimelineProject = () => {
  const { projectId } = useParams();
  return projectId ? <Navigate to={appRoutes.projects.timeline(projectId)} replace /> : <Navigate to={appRoutes.home} replace />;
};

const RedirectLegacyEditorProject = () => {
  const { projectId } = useParams();
  return projectId ? <Navigate to={appRoutes.projects.editor(projectId)} replace /> : <Navigate to={appRoutes.home} replace />;
};

const RedirectLegacyDirectorsCut = () => {
  const { projectId } = useParams();
  return projectId ? <Navigate to={appRoutes.projects.directorsCut(projectId)} replace /> : <Navigate to={appRoutes.home} replace />;
};

const ProtectedProjectRoute = ({ children }: { children: React.ReactNode }) => {
  const { projectId } = useParams();
  return <ProjectAccessGate projectId={projectId}>{children}</ProjectAccessGate>;
};

const fallback = <PerfShell headline="Preparing studio" />;

const AuthenticatedRoutes = () => {
  return (
    <ThirdwebProvider>
      <AuthProvider>
        <VoiceAgentProvider>
          <SidebarProvider>
            <CursorLoadingProvider>
              <CursorWrapper />
              <Toaster />
              <Sonner />
              <InsufficientCreditsDialog />
              <Suspense fallback={fallback}>
                <Routes>
                  <Route
                    path={appRoutes.home}
                    element={<ProtectedRoute><Home /></ProtectedRoute>}
                  />
                  <Route
                    path={appRoutes.projectSetup}
                    element={<ProtectedRoute><ProjectSetup /></ProtectedRoute>}
                  />
                  <Route
                    path={appRoutes.legacy.studioRoot}
                    element={<ProtectedRoute><StudioRootRoute /></ProtectedRoute>}
                  />
                  <Route
                    path="/projects/:projectId/studio"
                    element={<ProtectedRoute><ProtectedProjectRoute><StudioPage /></ProtectedProjectRoute></ProtectedRoute>}
                  />
                  {/* Legacy Asset Store surface folded into IP Vault. */}
                  <Route path={appRoutes.assets} element={<Navigate to={appRoutes.ipVault} replace />} />
                  <Route
                    path={appRoutes.ipVault}
                    element={<ProtectedRoute><IPVault /></ProtectedRoute>}
                  />
                  <Route path={appRoutes.legacy.ipVault} element={<Navigate to={appRoutes.ipVault} replace />} />
                  <Route
                    path={appRoutes.learningStudio}
                    element={<ProtectedRoute><LearningStudioPage /></ProtectedRoute>}
                  />
                  <Route
                    path="/projects/:projectId/timeline"
                    element={<ProtectedRoute><ProtectedProjectRoute><StoryboardPage /></ProtectedProjectRoute></ProtectedRoute>}
                  />
                  <Route
                    path="/projects/:projectId/observability"
                    element={<ProtectedRoute><ProtectedProjectRoute><ProjectObservabilityPage /></ProtectedProjectRoute></ProtectedRoute>}
                  />
                  <Route
                    path="/projects/:projectId/directors-cut"
                    element={<ProtectedRoute><ProtectedProjectRoute><DirectorCutPage /></ProtectedProjectRoute></ProtectedRoute>}
                  />
                  <Route
                    path="/projects/:projectId/editor"
                    element={<ProtectedRoute><ProtectedProjectRoute><EditorPage /></ProtectedProjectRoute></ProtectedRoute>}
                  />
                  <Route path="/studio/:projectId" element={<RedirectLegacyStudioProject />} />
                  <Route path="/timeline/:projectId" element={<RedirectLegacyTimelineProject />} />
                  <Route path="/timeline/:projectId/directors-cut" element={<RedirectLegacyDirectorsCut />} />
                  <Route path="/editor/:projectId" element={<RedirectLegacyEditorProject />} />
                  <Route path="/video-editor/:projectId" element={<RedirectLegacyEditorProject />} />
                  <Route path="/storyboard/:projectId" element={<RedirectProjectTimelineAlias />} />
                  <Route path="/project/:projectId/timeline" element={<RedirectProjectTimelineAlias />} />
                  <Route path={appRoutes.legacy.storyboardRoot} element={<Navigate to={appRoutes.home} replace />} />
                  <Route path={appRoutes.legacy.timelineRoot} element={<Navigate to={appRoutes.home} replace />} />
                  <Route path={appRoutes.legacy.editorRoot} element={<Navigate to={appRoutes.home} replace />} />
                  <Route
                    path="/credits"
                    element={<ProtectedRoute><Navigate to={appRoutes.settings.billing} replace /></ProtectedRoute>}
                  />
                  <Route
                    path={appRoutes.settings.root}
                    element={<ProtectedRoute><SettingsPage /></ProtectedRoute>}
                  />
                  <Route
                    path={appRoutes.settings.billing}
                    element={<ProtectedRoute><SettingsBillingPage /></ProtectedRoute>}
                  />
                  <Route
                    path={appRoutes.settings.billingDocs}
                    element={<ProtectedRoute><SettingsBillingDocsPage /></ProtectedRoute>}
                  />
                  <Route
                    path={appRoutes.storyboardGenerator}
                    element={<ProtectedRoute><Storyboard /></ProtectedRoute>}
                  />
                  <Route
                    path="/shot-editor/:shotId"
                    element={<ProtectedRoute><ShotEditor /></ProtectedRoute>}
                  />
                  <Route
                    path={appRoutes.kanvas}
                    element={
                      <ProtectedRoute>
                        <StudioErrorBoundary fallbackTitle="Kanvas encountered an error" fallbackDescription="The multi-studio canvas hit an unexpected issue">
                          <KanvasPage />
                        </StudioErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={appRoutes.kanvasLyrics}
                    element={
                      <ProtectedRoute>
                        <StudioErrorBoundary fallbackTitle="Lyrics wizard error" fallbackDescription="The Create Template wizard hit an unexpected issue">
                          <KanvasLyrics />
                        </StudioErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={appRoutes.kanvasLyricsNew}
                    element={
                      <ProtectedRoute>
                        <StudioErrorBoundary fallbackTitle="Lyrics wizard error" fallbackDescription="The Create Template wizard hit an unexpected issue">
                          <KanvasLyrics />
                        </StudioErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/kanvas/lyrics/templates/:templateId"
                    element={
                      <ProtectedRoute>
                        <StudioErrorBoundary fallbackTitle="Lyrics wizard error" fallbackDescription="The Create Template wizard hit an unexpected issue">
                          <KanvasLyrics />
                        </StudioErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/kanvas/remix/jobs/:jobId"
                    element={
                      <ProtectedRoute>
                        <StudioErrorBoundary fallbackTitle="Remix jobs error" fallbackDescription="The Remix job view hit an unexpected issue">
                          <KanvasRemixJobs />
                        </StudioErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={appRoutes.kanvasRemix}
                    element={
                      <ProtectedRoute>
                        <StudioErrorBoundary fallbackTitle="Remix error" fallbackDescription="The Remix studio hit an unexpected issue">
                          <KanvasRemix />
                        </StudioErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={appRoutes.clipper}
                    element={
                      <ProtectedRoute>
                        <StudioErrorBoundary fallbackTitle="Clipper error" fallbackDescription="The video clipping workflow hit an unexpected issue">
                          <Clipper />
                        </StudioErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={appRoutes.sourcify}
                    element={
                      <ProtectedRoute>
                        <StudioErrorBoundary fallbackTitle="Sourcify error" fallbackDescription="The source discovery workflow hit an unexpected issue">
                          <Sourcify />
                        </StudioErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={appRoutes.postz}
                    element={
                      <ProtectedRoute>
                        <StudioErrorBoundary fallbackTitle="Postz error" fallbackDescription="The social schedule calendar hit an unexpected issue">
                          <Postz />
                        </StudioErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path={appRoutes.clipStudio}
                    element={<ProtectedRoute><Navigate to={appRoutes.clipper} replace /></ProtectedRoute>}
                  />
                  <Route
                    path="/kanvas/remix/:templateId"
                    element={
                      <ProtectedRoute>
                        <StudioErrorBoundary fallbackTitle="Remix error" fallbackDescription="The Remix studio hit an unexpected issue">
                          <KanvasRemix />
                        </StudioErrorBoundary>
                      </ProtectedRoute>
                    }
                  />
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </CursorLoadingProvider>
          </SidebarProvider>
        </VoiceAgentProvider>
      </AuthProvider>
    </ThirdwebProvider>
  );
};

export default AuthenticatedRoutes;
