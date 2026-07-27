import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Circle, Copy, Download, Film, History, Loader2, Play, RefreshCw, Scissors, Send, TriangleAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import AppHeader from '@/components/AppHeader';
import { supabaseService } from '@/services/supabaseService';
import { useAppStore } from '@/store/appStore';
import { useDirectorCut, STAGE_LABELS, type DirectorCutJobState, type DirectorCutRenderHistoryItem, type DirectorCutStage } from '@/hooks/useDirectorCut';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import { DIRECTORS_CUT_CREDITS } from '@/lib/constants/credits';
import { LocalAssemblyPanel } from '@/features/local-media/LocalAssemblyPanel';
import { downloadFile } from '@/utils/downloadFile';

const StatCard = ({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'warn' | 'success';
}) => (
  <div
    className={cn(
      'rounded-xl border px-4 py-3 backdrop-blur-sm',
      tone === 'warn'
        ? 'border-amber-500/40 bg-amber-500/10'
        : tone === 'success'
          ? 'border-orange-500/40 bg-orange-500/10'
          : 'border-zinc-700/50 bg-zinc-900/50'
    )}
  >
    <p className="text-xs uppercase tracking-[0.16em] text-zinc-400">{label}</p>
    <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
  </div>
);

/** The ordered pipeline stages for the Director's Cut. */
const PIPELINE_STAGES: DirectorCutStage[] = [
  'syncing_assets',
  'preflighting_assets',
  'submitting_to_provider',
  'provider_processing',
  'fallback_processing',
  'downloading_assets',
  'uploading_final_video',
  'completed',
];

const stageIndex = (stage: DirectorCutStage): number =>
  PIPELINE_STAGES.indexOf(stage);

const StageIndicator = ({ currentStage }: { currentStage: DirectorCutStage }) => {
  const activeIdx = stageIndex(currentStage);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PIPELINE_STAGES.map((stage, idx) => {
        const isActive = idx === activeIdx;
        const isDone = idx < activeIdx;
        const isPending = idx > activeIdx;
        return (
          <div key={stage} className="flex items-center gap-1.5">
            {isDone ? (
              <CheckCircle2 className="h-4 w-4 text-orange-400" />
            ) : isActive ? (
              <Loader2 className="h-4 w-4 animate-spin text-cyan-300" />
            ) : (
              <Circle className={cn('h-4 w-4', isPending ? 'text-zinc-600' : 'text-zinc-400')} />
            )}
            <span
              className={cn(
                'text-xs whitespace-nowrap',
                isDone && 'text-orange-300/80',
                isActive && 'text-cyan-200 font-medium',
                isPending && 'text-zinc-600'
              )}
            >
              {STAGE_LABELS[stage]}
            </span>
            {idx < PIPELINE_STAGES.length - 1 && (
              <span className={cn('text-xs mx-1', isDone ? 'text-orange-500/50' : 'text-zinc-700')}>›</span>
            )}
          </div>
        );
      })}
    </div>
  );
};

const DebugRow = ({ label, value }: { label: string; value: string | number | null | undefined }) => {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="flex min-w-0 justify-between gap-3 border-t border-rose-300/10 py-1.5 text-xs">
      <span className="shrink-0 text-rose-200/55">{label}</span>
      <span className="min-w-0 break-words text-right font-mono text-rose-100/85">{String(value)}</span>
    </div>
  );
};

const buildDirectorCutDebugDetails = (job: DirectorCutJobState) =>
  JSON.stringify(
    {
      jobId: job.jobId,
      status: job.status,
      progress: job.progress,
      provider: job.provider,
      providerStatus: job.providerStatus,
      providerJobId: job.providerJobId,
      stage: job.debugSummary?.stage ?? job.stage,
      renderer: job.renderer,
      falRequestId: job.falRequestId,
      falError: job.falError,
      fallbackUsed: job.fallbackUsed,
      fallbackReason: job.fallbackReason,
      fallbackStatus: job.fallbackStatus,
      fallbackError: job.fallbackError,
      failedShotCount: job.failedShotCount,
      shotFailures: job.shotFailures ?? [],
    },
    null,
    2
  );

const formatRenderTimestamp = (value?: string | null) => {
  if (!value) return 'Not finished yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not finished yet';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const sanitizeFilenamePart = (value: string | null | undefined) =>
  (value || 'director-cut')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'director-cut';

const buildDirectorCutFilename = (projectTitle: string | null, jobId: string | null | undefined) => {
  const suffix = jobId ? `-${jobId.slice(0, 8)}` : '';
  return `${sanitizeFilenamePart(projectTitle)}-directors-cut${suffix}.mp4`;
};

const getDirectorCutEtaText = (job: DirectorCutJobState | null) => {
  if (!job || job.status !== 'processing') return null;
  if (job.progress >= 90 || job.stage === 'uploading_final_video') {
    return 'Finalizing the MP4 and preparing playback.';
  }
  if (job.stage === 'provider_processing' || job.stage === 'fallback_processing') {
    return 'ETA: usually 2-5 minutes, depending on shot count and provider queue.';
  }
  if (job.stage === 'downloading_assets') {
    return 'Collecting rendered media and checking the final file.';
  }
  return 'Preparing the render job.';
};

type SendTarget = {
  id: string;
  jobId: string | null;
  finalAssetId?: string | null;
  outputUrl?: string | null;
};

const DirectorCutPage = () => {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { setActiveProject } = useAppStore();
  const [projectMeta, setProjectMeta] = useState<{ title: string | null; aspectRatio: string | null }>({
    title: null,
    aspectRatio: null,
  });

  const {
    summary,
    job,
    error,
    isSyncing,
    isStarting,
    isPolling,
    history,
    isLoadingHistory,
    isSendingToEditor,
    syncAssets,
    startDirectorCut,
    loadHistory,
    sendToEditor,
  } = useDirectorCut(projectId);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      navigate(appRoutes.home);
      return;
    }

    const loadProject = async () => {
      const project = await supabaseService.projects.find(projectId);
      setActiveProject(projectId, project?.title || 'Untitled');
      setProjectMeta({
        title: project?.title ?? null,
        aspectRatio: project?.aspect_ratio ?? null,
      });
    };

    loadProject().catch(() => undefined);
  }, [navigate, projectId, setActiveProject]);

  useEffect(() => {
    if (!projectId) return;
    syncAssets().catch(() => undefined);
    loadHistory().catch(() => undefined);
  }, [loadHistory, projectId, syncAssets]);

  const progressValue = job?.progress ?? 0;
  const isWorking = isSyncing || isStarting || isPolling || job?.status === 'processing';
  const etaText = getDirectorCutEtaText(job);
  const providerReason =
    job?.fallbackError ||
    job?.falError ||
    job?.fallbackReason ||
    null;
  const setupError =
    job?.fallbackStatus === 'unavailable' &&
    /EDITFRAME_API_KEY|FAL_KEY/i.test(`${job.fallbackError ?? ''} ${job.error ?? ''}`);

  const copyDebugDetails = async () => {
    if (!job) return;
    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error('Clipboard is not available');
      }
      await navigator.clipboard.writeText(buildDirectorCutDebugDetails(job));
      toast.success("Director's Cut debug details copied");
    } catch (copyError) {
      const message = copyError instanceof Error ? copyError.message : 'Failed to copy debug details';
      toast.error(message);
    }
  };

  const handleDownload = async (id: string, url: string | null | undefined, jobId?: string | null) => {
    if (!url) {
      toast.error('No final video URL is available yet');
      return;
    }

    setDownloadingId(id);
    try {
      await downloadFile(url, buildDirectorCutFilename(projectMeta.title, jobId));
      toast.success("Director's Cut download started");
    } catch (downloadError) {
      const message = downloadError instanceof Error ? downloadError.message : 'Failed to download final video';
      toast.error(message);
    } finally {
      setDownloadingId(null);
    }
  };

  const handleSendToEditor = async (target: SendTarget) => {
    if (!projectId) return;
    if (!target.outputUrl && !target.finalAssetId) {
      toast.error('No completed video is available to send to the editor');
      return;
    }

    setSendingId(target.id);
    try {
      if (target.jobId) {
        const asset = await sendToEditor(target.jobId);
        if (!asset) return;
      }
      toast.success("Director's Cut is available in the editor media bin");
      navigate(appRoutes.projects.editor(projectId));
    } finally {
      setSendingId(null);
    }
  };

  return (
    <div className="flex h-screen flex-col bg-[#0A0D16]">
      <AppHeader />
      <div className="flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto w-full max-w-5xl space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-cyan-300/80">Timeline Export</p>
              <h1 className="mt-2 flex items-center gap-2 text-3xl font-semibold text-white">
                <Scissors className="h-7 w-7 text-cyan-300" />
                Director&apos;s Cut
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                Build a chronological final cut from timeline shots with Fal-first export and automatic fallback.
              </p>
            </div>
            <Button variant="outline" className="border-zinc-700 text-zinc-100" asChild>
              <Link to={projectId ? appRoutes.projects.timeline(projectId) : appRoutes.home}>Back to Timeline</Link>
            </Button>
          </div>

          <div className="grid gap-3 md:grid-cols-7">
            <StatCard label="Shots" value={summary?.totalShots ?? 0} />
            <StatCard label="Ready Shots" value={summary?.readyShots ?? 0} tone="success" />
            <StatCard label="Synced Assets" value={summary?.syncedAssets ?? 0} />
            <StatCard label="Ready Videos" value={summary?.readyVideos ?? 0} tone="success" />
            <StatCard label="Image Fallbacks" value={summary?.fallbackImages ?? 0} tone="warn" />
            <StatCard label="Audio" value={summary?.audioAssets ?? 0} />
            <StatCard label="Missing" value={summary?.missingShots ?? 0} tone="warn" />
          </div>

          {summary && !summary.canExport && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
                <div className="min-w-0">
                  <p className="font-medium text-amber-100">Full-cut export is blocked</p>
                  <p className="mt-1 text-sm text-amber-100/75">
                    {summary.blockingReason ??
                      "Generate an image or video for every ordered shot before starting Director's Cut."}
                  </p>
                  {summary.missingShotDetails.length > 0 && (
                    <ul className="mt-3 grid gap-1 text-xs text-amber-100/65 sm:grid-cols-2">
                      {summary.missingShotDetails.slice(0, 10).map((shot) => (
                        <li key={shot.shotId}>
                          Scene {shot.sceneNumber ?? 'n/a'}, shot {shot.shotNumber ?? 'n/a'}: {shot.reason}
                        </li>
                      ))}
                      {summary.missingShotDetails.length > 10 && (
                        <li>+{summary.missingShotDetails.length - 10} more missing shots</li>
                      )}
                    </ul>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/60 p-5">
            <div className="flex flex-wrap gap-3">
              <Button
                onClick={() => syncAssets()}
                disabled={isSyncing || isStarting}
                className="bg-zinc-200 text-zinc-900 hover:bg-zinc-100"
              >
                {isSyncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Syncing...
                  </>
                ) : (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4" />
                    Sync Timeline Assets
                  </>
                )}
              </Button>

              <Button
                onClick={() => startDirectorCut()}
                disabled={isWorking || !summary?.canExport}
                className="bg-gradient-to-r from-cyan-500 to-blue-500 text-white hover:from-cyan-400 hover:to-blue-400"
              >
                {isWorking ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Film className="mr-2 h-4 w-4" />
                    Start Director&apos;s Cut ({DIRECTORS_CUT_CREDITS} credits)
                  </>
                )}
              </Button>
            </div>

            <div className="mt-5 space-y-3">
              <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-zinc-400">
                <span>
                  {job?.status
                    ? `${job.status}${job.stage && job.stage !== 'idle' ? ` — ${STAGE_LABELS[job.stage]}` : ''}`
                    : 'Idle'}
                </span>
                <span>{progressValue}%</span>
              </div>
              <Progress value={progressValue} className="h-2 bg-zinc-800" />
              {job?.status === 'processing' && job.stage && (
                <div className="pt-1">
                  <StageIndicator currentStage={job.stage} />
                </div>
              )}
              {etaText && (
                <p className="text-xs text-cyan-200/70">{etaText}</p>
              )}
              {(!job || job.status !== 'processing') && (
                <p className="text-xs text-zinc-500">
                  Pipeline: sync assets → submit to provider → process → upload → done
                </p>
              )}
            </div>

            {(error || job?.error) && (
              <div className="mt-4 rounded-lg border border-rose-500/40 bg-rose-500/10 p-3 text-sm text-rose-200">
                <div className="flex items-start gap-2">
                  <TriangleAlert className="mt-0.5 h-4 w-4" />
                  <div>
                    <p className="font-medium">Director&apos;s Cut failed</p>
                    <p className="text-rose-200/80">{job?.error || error}</p>
                    <p className="mt-1 text-xs text-rose-200/70">
                      Provider: {job?.provider || 'fal'}
                      {job?.providerStatus ? ` (${job.providerStatus})` : ''}
                      {job?.fallbackUsed ? ' · fallback used' : ''}
                    </p>
                    {providerReason && (
                      <p className="mt-1 text-xs text-rose-200/70">Reason: {providerReason}</p>
                    )}
                    {setupError && (
                      <div className="mt-3 border-l-2 border-amber-300/60 pl-3 text-xs text-amber-100/85">
                        Editframe fallback is not configured for this Supabase function. Add the missing provider secret,
                        then retry the export with the same synced assets.
                      </div>
                    )}
                    {job && (
                      <div className="mt-3 max-w-3xl">
                        <div className="mb-1 flex items-center justify-between gap-3">
                          <p className="text-xs font-medium uppercase tracking-[0.14em] text-rose-100/70">
                            Render diagnostics
                          </p>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs text-rose-100 hover:bg-rose-500/20"
                            onClick={() => void copyDebugDetails()}
                          >
                            <Copy className="mr-1.5 h-3.5 w-3.5" />
                            Copy Debug Details
                          </Button>
                        </div>
                        <DebugRow label="Renderer" value={job.renderer} />
                        <DebugRow label="Stage" value={job.debugSummary?.stage ?? job.stage} />
                        <DebugRow label="Fal request" value={job.falRequestId} />
                        <DebugRow label="Provider job" value={job.providerJobId} />
                        <DebugRow label="Fallback status" value={job.fallbackStatus} />
                        <DebugRow label="Fallback error" value={job.fallbackError} />
                        <DebugRow label="Fal error" value={job.falError} />
                        <DebugRow label="Failed shots" value={job.failedShotCount} />
                      </div>
                    )}
                    {job?.shotFailures && job.shotFailures.length > 0 && (
                      <div className="mt-3">
                        <p className="text-xs font-medium uppercase tracking-[0.14em] text-rose-100/70">
                          Shot failures
                        </p>
                        <ul className="mt-1 space-y-1">
                          {job.shotFailures.map((failure) => (
                            <li key={`${failure.assetId}-${failure.orderIndex}`} className="text-xs text-rose-100/70">
                              Shot #{failure.orderIndex + 1}: {failure.reason}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-rose-300/40 text-rose-100 hover:bg-rose-500/20"
                    onClick={() => syncAssets()}
                    disabled={isWorking}
                  >
                    Sync Again
                  </Button>
                  <Button
                    size="sm"
                    className="bg-rose-500 text-white hover:bg-rose-400"
                    onClick={() => startDirectorCut({ reuseSyncedAssets: true })}
                    disabled={isWorking || !summary?.canExport}
                  >
                    Retry Export
                  </Button>
                </div>
              </div>
            )}
          </div>

          {projectId ? (
            <LocalAssemblyPanel
              projectId={projectId}
              projectTitle={projectMeta.title}
              aspectRatio={projectMeta.aspectRatio}
            />
          ) : null}

          {job?.status === 'processing' && (
            <div className="rounded-2xl border border-cyan-500/30 bg-cyan-500/5 p-6">
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin text-cyan-300" />
                <div>
                  <p className="font-medium text-cyan-100">Generating Director&apos;s Cut...</p>
                  <p className="text-sm text-cyan-200/70">
                    Stage: {STAGE_LABELS[job.stage] || 'Processing'}
                    {' · '}Provider: {job.provider || 'fal'}
                    {job.providerStatus ? ` (${job.providerStatus})` : ''}
                    {job.fallbackUsed ? ' · Fallback active' : ''}
                  </p>
                  {etaText && <p className="mt-1 text-xs text-cyan-200/60">{etaText}</p>}
                </div>
              </div>
            </div>
          )}

          {job?.status === 'completed' && job.outputUrl && (
            <div className="rounded-2xl border border-orange-500/40 bg-orange-500/10 p-6">
              <p className="mb-4 flex items-center gap-2 text-orange-200">
                <Play className="h-4 w-4" />
                Director&apos;s Cut Ready
              </p>
              <video
                src={job.outputUrl}
                controls
                className="w-full rounded-xl border border-orange-300/30 bg-black"
              />
              <div className="mt-4 flex flex-wrap gap-3">
                <Button
                  className="bg-orange-500 text-white hover:bg-orange-400"
                  onClick={() => void handleDownload(job.jobId, job.outputUrl, job.jobId)}
                  disabled={downloadingId === job.jobId}
                >
                  {downloadingId === job.jobId ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="mr-2 h-4 w-4" />
                  )}
                  Download Final Video
                </Button>
                <Button
                  variant="outline"
                  className="border-orange-300/40 text-orange-100 hover:bg-orange-500/20"
                  onClick={() => void handleSendToEditor({ id: job.jobId, jobId: job.jobId, outputUrl: job.outputUrl })}
                  disabled={isSendingToEditor || sendingId === job.jobId}
                >
                  {sendingId === job.jobId ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="mr-2 h-4 w-4" />
                  )}
                  Send to Editor
                </Button>
              </div>
            </div>
          )}

          {/* Partial failure warning */}
          {job?.partialSuccess && job.shotFailures && job.shotFailures.length > 0 && (
            <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-5">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 text-amber-400" />
                <div>
                  <p className="font-medium text-amber-200">
                    {job.shotFailures.length} shot(s) were skipped
                  </p>
                  <p className="mt-1 text-sm text-amber-200/70">
                    The final video was produced from the remaining successful shots.
                    Re-generate the failed shots and run Director&apos;s Cut again for a complete export.
                  </p>
                  <ul className="mt-3 space-y-1">
                    {job.shotFailures.map((failure) => (
                      <li key={failure.assetId} className="text-xs text-amber-200/60">
                        Shot #{failure.orderIndex + 1}: {failure.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-zinc-700/60 bg-zinc-900/50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                  <History className="h-4 w-4 text-cyan-300" />
                  Render History
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  Previous Director&apos;s Cut renders stay playable here and available to the editor.
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                className="border-zinc-700 text-zinc-100"
                onClick={() => void loadHistory()}
                disabled={isLoadingHistory}
              >
                {isLoadingHistory ? (
                  <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                )}
                Refresh
              </Button>
            </div>

            {isLoadingHistory && history.length === 0 ? (
              <div className="mt-4 space-y-3">
                {[0, 1].map((idx) => (
                  <div key={idx} className="h-24 animate-pulse rounded-xl bg-zinc-800/70" />
                ))}
              </div>
            ) : history.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-zinc-700 p-6 text-sm text-zinc-500">
                Finished renders will appear here after the first Director&apos;s Cut completes.
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {history.map((render: DirectorCutRenderHistoryItem) => {
                  const isCompleted = render.status === 'completed' && !!render.outputUrl;
                  const timestamp = formatRenderTimestamp(render.completedAt ?? render.startedAt ?? render.createdAt);
                  const rowId = render.id;
                  const canSend = Boolean(isCompleted && (render.jobId || render.finalAssetId));

                  return (
                    <div
                      key={render.id}
                      className="grid gap-4 rounded-xl border border-zinc-800 bg-zinc-950/55 p-4 md:grid-cols-[180px_1fr]"
                    >
                      <div className="overflow-hidden rounded-lg border border-zinc-800 bg-black">
                        {isCompleted ? (
                          <video
                            src={render.outputUrl ?? undefined}
                            controls
                            preload="metadata"
                            className="aspect-video w-full bg-black object-contain"
                          />
                        ) : (
                          <div className="flex aspect-video items-center justify-center text-xs text-zinc-500">
                            {render.status === 'failed' ? 'Render failed' : 'Processing'}
                          </div>
                        )}
                      </div>

                      <div className="min-w-0">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-medium text-zinc-100">
                              Director&apos;s Cut {render.jobId ? render.jobId.slice(0, 8) : render.finalAssetId?.slice(0, 8)}
                            </p>
                            <p className="mt-1 text-xs text-zinc-500">
                              {timestamp}
                              {' · '}
                              {render.provider || 'director_cut'}
                              {render.fallbackUsed ? ' · fallback used' : ''}
                            </p>
                          </div>
                          <span
                            className={cn(
                              'rounded-full border px-2 py-0.5 text-xs capitalize',
                              render.status === 'completed'
                                ? 'border-orange-400/30 bg-orange-500/10 text-orange-200'
                                : render.status === 'failed'
                                  ? 'border-rose-400/30 bg-rose-500/10 text-rose-200'
                                  : 'border-cyan-400/30 bg-cyan-500/10 text-cyan-200'
                            )}
                          >
                            {render.status}
                          </span>
                        </div>

                        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                          <span>{STAGE_LABELS[render.stage] ?? render.stage}</span>
                          <span>Progress {render.progress}%</span>
                          {render.partialSuccess && <span>{render.shotFailures.length} skipped shot(s)</span>}
                        </div>

                        {render.error && (
                          <p className="mt-3 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100/80">
                            {render.error}
                          </p>
                        )}

                        {render.shotFailures.length > 0 && (
                          <ul className="mt-3 space-y-1 text-xs text-amber-100/70">
                            {render.shotFailures.slice(0, 3).map((failure) => (
                              <li key={`${render.id}-${failure.assetId}-${failure.orderIndex}`}>
                                Shot #{failure.orderIndex + 1}: {failure.reason}
                              </li>
                            ))}
                          </ul>
                        )}

                        {isCompleted && (
                          <div className="mt-4 flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              className="bg-orange-500 text-white hover:bg-orange-400"
                              onClick={() => void handleDownload(rowId, render.outputUrl, render.jobId)}
                              disabled={downloadingId === rowId}
                            >
                              {downloadingId === rowId ? (
                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Download className="mr-2 h-3.5 w-3.5" />
                              )}
                              Download
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-zinc-700 text-zinc-100 hover:bg-zinc-800"
                              onClick={() =>
                                void handleSendToEditor({
                                  id: rowId,
                                  jobId: render.jobId,
                                  finalAssetId: render.finalAssetId,
                                  outputUrl: render.outputUrl,
                                })
                              }
                              disabled={!canSend || isSendingToEditor || sendingId === rowId}
                            >
                              {sendingId === rowId ? (
                                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Send className="mr-2 h-3.5 w-3.5" />
                              )}
                              Send to Editor
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DirectorCutPage;
