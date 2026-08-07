import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Circle, Copy, Film, Loader2, Play, RefreshCw, Scissors, TriangleAlert, Video } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import AppHeader from '@/components/AppHeader';
import { supabaseService } from '@/services/supabaseService';
import { useAppStore } from '@/store/appStore';
import { useDirectorCut, STAGE_LABELS, type DirectorCutJobState, type DirectorCutStage } from '@/hooks/useDirectorCut';
import { cn } from '@/lib/utils';
import { appRoutes } from '@/lib/routes';
import { DIRECTORS_CUT_CREDITS } from '@/lib/constants/credits';
import { LocalAssemblyPanel } from '@/features/local-media/LocalAssemblyPanel';
import { FloatingNavPill } from '@/components/home/FloatingNavPill';

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
    syncAssets,
    startDirectorCut,
  } = useDirectorCut(projectId);

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
  }, [projectId, syncAssets]);

  const progressValue = job?.progress ?? 0;
  const isWorking = isSyncing || isStarting || isPolling || job?.status === 'processing';
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

  return (
    <div className="flex h-screen flex-col bg-[#0A0D16]">
      <div className="hidden md:block">
        <FloatingNavPill activeView="directors-cut" />
      </div>
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
                <Button className="bg-orange-500 text-white hover:bg-orange-400" asChild>
                  <a href={job.outputUrl} target="_blank" rel="noreferrer">
                    <Video className="mr-2 h-4 w-4" />
                    Download Final Video
                  </a>
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
        </div>
      </div>
    </div>
  );
};

export default DirectorCutPage;
