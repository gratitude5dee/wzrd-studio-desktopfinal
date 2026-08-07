import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, Loader2, RefreshCcw, Sparkles, XCircle, Activity, Eye, Shield, Zap, BarChart3, GitBranch } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { AuraJudgePanel } from '@/components/observability/AuraJudgePanel';
import { appRoutes } from '@/lib/routes';
import {
  observabilityService,
  type ProjectObservabilityData,
} from '@/services/observabilityService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  Bar,
  BarChart,
  type ChartConfig,
  Grid,
  Legend,
  Radar,
  RadarChart,
  Tooltip as DitherTooltip,
  XAxis,
  YAxis,
} from '@/components/dither-kit';
import { ditherBloom, ditherColors } from '@/lib/ditherTheme';

/* ── helpers ─────────────────────────────────────────────── */

const relativeTime = (value?: string | null) => {
  if (!value) return 'n/a';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'n/a';
  const diff = Date.now() - parsed.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

const scoreLabel = (value: unknown) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 'n/a';
  return value.toFixed(2);
};

const scorePercent = (value: unknown) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return Math.round(value * 100);
};

const thresholdRadarConfig: ChartConfig = {
  score: { label: 'Threshold', color: ditherColors.primary },
};

const runsBarConfig: ChartConfig = {
  generation: { label: 'Generation', color: ditherColors.primary },
  evaluation: { label: 'Evaluation', color: ditherColors.secondary },
};

type StatusColor = 'emerald' | 'red' | 'amber' | 'blue' | 'zinc';
type ReviewTargetType = 'storyline' | 'scene' | 'shot' | 'character';

const getStatusColor = (status: string | null | undefined): StatusColor => {
  switch (status) {
    case 'completed': case 'resolved': case 'clear': case 'executed':
      return 'emerald';
    case 'failed': case 'needs_revision':
      return 'red';
    case 'running': case 'processing': case 'queued':
      return 'amber';
    case 'open': case 'in_review': case 'needs_review': case 'proposed': case 'approved':
      return 'blue';
    default:
      return 'zinc';
  }
};

const isReviewTargetType = (value: string): value is ReviewTargetType =>
  value === 'storyline' || value === 'scene' || value === 'shot' || value === 'character';

const statusBorderClass: Record<StatusColor, string> = {
  emerald: 'border-l-emerald-500',
  red: 'border-l-red-500',
  amber: 'border-l-amber-500',
  blue: 'border-l-blue-500',
  zinc: 'border-l-zinc-500',
};

const statusDotClass: Record<StatusColor, string> = {
  emerald: 'bg-emerald-500',
  red: 'bg-red-500',
  amber: 'bg-amber-500',
  blue: 'bg-blue-500',
  zinc: 'bg-zinc-500',
};

const statusBadgeClass: Record<StatusColor, string> = {
  emerald: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  red: 'bg-red-500/15 text-red-400 border-red-500/30',
  amber: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  blue: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  zinc: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/30',
};

const StatusIcon = ({ status }: { status?: string | null }) => {
  switch (status) {
    case 'completed': case 'resolved': case 'clear': case 'executed':
      return <CheckCircle2 className="h-4 w-4 text-emerald-400" />;
    case 'failed': case 'needs_revision':
      return <XCircle className="h-4 w-4 text-red-400" />;
    case 'running': case 'processing': case 'queued':
      return <Loader2 className="h-4 w-4 animate-spin text-amber-400" />;
    default:
      return <Clock className="h-4 w-4 text-zinc-400" />;
  }
};

const StatusBadge = ({ status }: { status?: string | null }) => {
  const color = getStatusColor(status);
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider', statusBadgeClass[color])}>
      <span className={cn('h-1.5 w-1.5 rounded-full', statusDotClass[color])} />
      {status || 'unknown'}
    </span>
  );
};

/* ── sub-components ───────────────────────────────────────── */

const EmptyState = ({ title, description, icon: Icon }: { title: string; description: string; icon?: LucideIcon }) => (
  <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center rounded-2xl border border-white/[0.06] bg-white/[0.02] p-12 text-center">
    {Icon && <Icon className="mb-4 h-10 w-10 text-white/20" />}
    <h3 className="text-sm font-medium text-white/60">{title}</h3>
    <p className="mt-1 max-w-sm text-xs text-white/30">{description}</p>
  </motion.div>
);

const StatCard = ({ title, value, note, icon: Icon }: { title: string; value: string | number; note: string; icon: LucideIcon }) => (
  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
    <Card className="group relative overflow-hidden border-white/[0.06] bg-white/[0.02] backdrop-blur-sm transition-all duration-300 hover:border-white/[0.12] hover:bg-white/[0.04]">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
      <CardContent className="flex items-start gap-4 p-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/[0.04] text-white/40 transition-colors group-hover:bg-primary/10 group-hover:text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-white/40">{title}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-white">{value}</p>
          <p className="mt-0.5 text-xs text-white/30">{note}</p>
        </div>
      </CardContent>
    </Card>
  </motion.div>
);

const ScoreBar = ({ label, value, maxValue = 1 }: { label: string; value: unknown; maxValue?: number }) => {
  const numVal = typeof value === 'number' ? value : 0;
  const pct = Math.round((numVal / maxValue) * 100);
  const color = pct >= 70 ? 'bg-emerald-500' : pct >= 40 ? 'bg-amber-500' : 'bg-red-500';

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-xs">
        <span className="text-white/50">{label}</span>
        <span className="font-mono text-white/70">{scoreLabel(value)}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
        <motion.div initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.8, ease: 'easeOut' }} className={cn('h-full rounded-full', color)} />
      </div>
    </div>
  );
};

/* ── filter chips ─────────────────────────────────────────── */
type StatusFilter = 'all' | 'completed' | 'failed' | 'running' | 'queued';

const FilterChip = ({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      'rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-wider transition-all',
      active ? 'border-primary/40 bg-primary/10 text-primary' : 'border-white/[0.08] bg-transparent text-white/40 hover:border-white/[0.15] hover:text-white/60'
    )}
  >
    {label}
  </button>
);

/* ── main page ────────────────────────────────────────────── */

const ProjectObservabilityPage = () => {
  const { projectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<ProjectObservabilityData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [tags, setTags] = useState<Record<string, string>>({});
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  const load = useCallback(async () => {
    if (!projectId) { navigate(appRoutes.home); return; }
    setIsLoading(true);
    try {
      const next = await observabilityService.getProjectObservability(projectId);
      setData(next);
    } catch (error) {
      console.error('Failed to load observability data', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load observability data');
    } finally {
      setIsLoading(false);
    }
  }, [navigate, projectId]);

  useEffect(() => { void load(); }, [load]);

  const systemHealthy = useMemo(() => {
    if (!data) return true;
    return data.overview.activeEvaluationJobs === 0 || data.overview.failedJudgeFamilies.length === 0;
  }, [data]);

  const timelineItems = useMemo(() => {
    if (!data) return [];
    const items = [
      ...data.generationJobs.map((job) => ({
        id: `generation-${job.id}`,
        type: 'generation' as const,
        created_at: job.created_at,
        status: job.status,
        label: `${job.job_type} job`,
        detail: job.model_id || job.external_request_id || 'generation',
      })),
      ...data.evaluationRuns.map((run) => ({
        id: `evaluation-${run.id}`,
        type: 'evaluation' as const,
        created_at: run.created_at,
        status: run.status,
        label: `${run.target_type || 'target'} evaluation`,
        detail: run.rubric_version || run.mode || 'shadow',
      })),
    ].sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    if (statusFilter === 'all') return items;
    return items.filter((item) => item.status === statusFilter);
  }, [data, statusFilter]);

  const thresholdRadarData = useMemo(
    () => [
      { metric: 'Storyline', score: scorePercent(data?.thresholds.storyline) },
      { metric: 'Continuity', score: scorePercent(data?.thresholds.continuity) },
      { metric: 'Character', score: scorePercent(data?.thresholds.character_consistency) },
      { metric: 'Canon', score: scorePercent(data?.thresholds.canon_compliance) },
      { metric: 'Disagreement', score: scorePercent(data?.thresholds.max_disagreement) },
    ],
    [data]
  );

  // Runs already listed on the Runs tab, bucketed by status for the dither bars.
  const runsByStatus = useMemo(() => {
    const buckets = new Map<string, { status: string; generation: number; evaluation: number }>();
    for (const item of timelineItems) {
      const status = item.status || 'unknown';
      const bucket = buckets.get(status) ?? { status, generation: 0, evaluation: 0 };
      bucket[item.type] += 1;
      buckets.set(status, bucket);
    }
    return [...buckets.values()];
  }, [timelineItems]);

  const submitReview = useCallback(
    async (taskId: string, feedbackType: 'approve' | 'reject' | 'annotate', targetType: 'storyline' | 'scene' | 'shot' | 'character', targetId: string) => {
      if (!projectId) return;
      setIsSubmitting(taskId);
      try {
        await observabilityService.submitReviewEvent({
          projectId, reviewTaskId: taskId, targetType, targetId, feedbackType,
          note: notes[taskId] || undefined,
          rejectionReasonCodes: feedbackType === 'reject' ? (tags[taskId] || '').split(',').map((t) => t.trim()).filter(Boolean) : [],
        });
        toast.success(`Review ${feedbackType} recorded`);
        await load();
      } catch (error) {
        console.error('Failed to submit review event', error);
        toast.error(error instanceof Error ? error.message : 'Failed to submit review event');
      } finally {
        setIsSubmitting(null);
      }
    },
    [load, notes, projectId, tags]
  );

  if (!projectId) return null;

  return (
    <div className="min-h-screen bg-[#07070b] text-foreground">
      {/* ── Header ───────────────────────────────────────── */}
      <div className="relative border-b border-white/[0.06] bg-black/40 backdrop-blur-xl">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5">
          <div className="space-y-1.5">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" className="text-white/50 hover:text-white" onClick={() => navigate(appRoutes.projects.timeline(projectId))}>
                <ArrowLeft className="mr-2 h-4 w-4" /> Timeline
              </Button>
              <span className="text-white/10">|</span>
              <div className="flex items-center gap-2">
                <span className={cn('h-2 w-2 rounded-full', systemHealthy ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]' : 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.5)]')} />
                <span className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
                  {systemHealthy ? 'System healthy' : 'Attention needed'}
                </span>
              </div>
            </div>
            <h1 className="text-2xl font-semibold tracking-tight text-white">
              {data?.projectTitle || 'Project'} <span className="text-white/30">/ observability</span>
            </h1>
          </div>
          <Button variant="outline" size="sm" className="border-white/[0.08] bg-white/[0.02] text-white/60 hover:bg-white/[0.06] hover:text-white" onClick={() => void load()} disabled={isLoading}>
            {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCcw className="mr-2 h-4 w-4" />}
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-6 py-8">
        {isLoading && !data ? (
          <div className="flex items-center gap-3 text-sm text-white/40">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading project observability…
          </div>
        ) : (
          <Tabs defaultValue="overview" className="space-y-8">
            <TabsList className="inline-flex gap-1 rounded-xl border border-white/[0.06] bg-white/[0.02] p-1">
              {['overview', 'runs', 'judges', 'judge', 'review', 'revision', 'narrative'].map((tab) => (
                <TabsTrigger key={tab} value={tab} className="rounded-lg px-4 py-2 text-xs font-medium capitalize text-white/40 transition-all data-[state=active]:bg-white/[0.08] data-[state=active]:text-white data-[state=active]:shadow-sm">
                  {tab}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── Overview ──────────────────────────────── */}
            <TabsContent value="overview" className="space-y-8">
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <StatCard icon={Eye} title="Open Reviews" value={data?.overview.openReviewTasks ?? 0} note="Human attention required" />
                <StatCard icon={GitBranch} title="Pending Revisions" value={data?.overview.pendingRevisions ?? 0} note="Auto-drafted corrective actions" />
                <StatCard icon={Shield} title="Completed Evals" value={data?.overview.completedEvaluations ?? 0} note="Shadow judge runs persisted" />
                <StatCard icon={Zap} title="Active Jobs" value={data?.overview.activeEvaluationJobs ?? 0} note="Queued or processing" />
              </div>

              <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
                <Card className="border-white/[0.06] bg-white/[0.02]">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium text-white">
                      <Activity className="h-4 w-4 text-primary" /> Attention hotspots
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4 text-sm">
                    <div className="flex items-center justify-between rounded-lg bg-white/[0.02] px-4 py-3">
                      <span className="text-white/60">Shots needing review</span>
                      <span className="font-mono text-lg font-bold text-white">{data?.overview.needsAttentionShots ?? 0}</span>
                    </div>
                    <div className="flex items-center justify-between rounded-lg bg-white/[0.02] px-4 py-3">
                      <span className="text-white/60">Scenes needing review</span>
                      <span className="font-mono text-lg font-bold text-white">{data?.overview.needsAttentionScenes ?? 0}</span>
                    </div>
                    <Separator className="bg-white/[0.06]" />
                    <div className="space-y-2">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Failed judge families</p>
                      <div className="flex flex-wrap gap-2">
                        {data?.overview.failedJudgeFamilies.length ? (
                          data.overview.failedJudgeFamilies.map((family) => (
                            <span key={family} className="rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-red-400">{family}</span>
                          ))
                        ) : (
                          <span className="text-xs text-white/20">No current failures</span>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-white/[0.06] bg-white/[0.02]">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium text-white">
                      <BarChart3 className="h-4 w-4 text-primary" /> Thresholds
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <RadarChart
                      data={thresholdRadarData}
                      config={thresholdRadarConfig}
                      nameKey="metric"
                      bloom={ditherBloom.marketing}
                      className="h-52 w-full"
                    >
                      <Radar dataKey="score" />
                    </RadarChart>
                    <ScoreBar label="Storyline" value={data?.thresholds.storyline} />
                    <ScoreBar label="Continuity" value={data?.thresholds.continuity} />
                    <ScoreBar label="Character consistency" value={data?.thresholds.character_consistency} />
                    <ScoreBar label="Canon compliance" value={data?.thresholds.canon_compliance} />
                    <ScoreBar label="Max disagreement" value={data?.thresholds.max_disagreement} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* ── Runs ──────────────────────────────────── */}
            <TabsContent value="runs" className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {(['all', 'completed', 'failed', 'running', 'queued'] as StatusFilter[]).map((f) => (
                  <FilterChip key={f} label={f} active={statusFilter === f} onClick={() => setStatusFilter(f)} />
                ))}
              </div>

              {timelineItems.length === 0 ? (
                <EmptyState icon={Activity} title="No runs yet" description="Generation and evaluation runs will appear here once the pipeline starts." />
              ) : (
                <>
                <Card className="border-white/[0.06] bg-white/[0.02]">
                  <CardHeader className="pb-4">
                    <CardTitle className="flex items-center gap-2 text-sm font-medium text-white">
                      <BarChart3 className="h-4 w-4 text-primary" /> Runs by status
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <BarChart
                      data={runsByStatus}
                      config={runsBarConfig}
                      bloom={ditherBloom.marketing}
                      className="h-56 w-full"
                    >
                      <Grid />
                      <Bar dataKey="generation" />
                      <Bar dataKey="evaluation" />
                      <XAxis dataKey="status" />
                      <YAxis />
                      <Legend />
                      <DitherTooltip labelKey="status" />
                    </BarChart>
                  </CardContent>
                </Card>

                <AnimatePresence mode="popLayout">
                  {timelineItems.map((item, i) => {
                    const color = getStatusColor(item.status);
                    return (
                      <motion.div key={item.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ delay: i * 0.03 }}>
                        <Card className={cn('border-l-2 border-white/[0.06] bg-white/[0.02] transition-all hover:bg-white/[0.04]', statusBorderClass[color])}>
                          <CardContent className="flex items-center justify-between gap-4 px-5 py-4">
                            <div className="flex items-center gap-3">
                              <StatusIcon status={item.status} />
                              <div>
                                <div className="flex items-center gap-2">
                                  <StatusBadge status={item.status} />
                                  <span className="text-[10px] font-medium uppercase tracking-wider text-white/30">{item.type}</span>
                                </div>
                                <p className="mt-1 text-sm text-white/80">{item.label}</p>
                                <p className="text-xs text-white/30">{item.detail}</p>
                              </div>
                            </div>
                            <span className="shrink-0 text-xs text-white/30">{relativeTime(item.created_at)}</span>
                          </CardContent>
                        </Card>
                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                </>
              )}
            </TabsContent>

            {/* ── Judges ────────────────────────────────── */}
            <TabsContent value="judges" className="space-y-6">
              {!data?.evaluationRuns.length ? (
                <EmptyState icon={Shield} title="No judge output yet" description="Completed evaluation runs will expose criterion scores, disagreement, and evidence here." />
              ) : (
                data.evaluationRuns.map((run) => {
                  const color = getStatusColor(run.status);
                  return (
                    <motion.div key={run.id} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
                      <Card className={cn('border-l-2 border-white/[0.06] bg-white/[0.02]', statusBorderClass[color])}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <CardTitle className="text-sm font-medium text-white">
                                {run.target_type || 'target'} · <span className="font-mono text-white/50">{run.target_id?.slice(0, 8) || '—'}</span>
                              </CardTitle>
                              <p className="mt-0.5 text-xs text-white/30">
                                {run.mode || 'shadow'} · {run.rubric_version || 'rubric pending'} · {relativeTime(run.created_at)}
                              </p>
                            </div>
                            <StatusBadge status={run.status} />
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-5">
                          {/* Aggregates as score bars */}
                          {run.aggregates && typeof run.aggregates === 'object' && (
                            <div className="space-y-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Aggregate scores</p>
                              <div className="grid gap-3 sm:grid-cols-2">
                                {Object.entries(run.aggregates as Record<string, unknown>).map(([key, val]) => (
                                  <ScoreBar key={key} label={key.replace(/_/g, ' ')} value={val} />
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Disagreement & reliability as compact JSON */}
                          <div className="grid gap-3 md:grid-cols-2">
                            {run.disagreement && (
                              <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">Disagreement</p>
                                <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-[10px] leading-relaxed text-zinc-400">
                                  {JSON.stringify(run.disagreement, null, 2)}
                                </pre>
                              </div>
                            )}
                            {run.reliability_snapshot && (
                              <div>
                                <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-white/30">Reliability</p>
                                <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-[10px] leading-relaxed text-zinc-400">
                                  {JSON.stringify(run.reliability_snapshot, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>

                          {/* Individual results */}
                          {(data.evaluationResultsByRun[run.id] ?? []).length > 0 && (
                            <div className="space-y-3">
                              <p className="text-[10px] font-semibold uppercase tracking-wider text-white/30">Judge results</p>
                              {(data.evaluationResultsByRun[run.id] ?? []).map((result) => (
                                <div key={result.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-4">
                                  <div className="flex items-start justify-between gap-3">
                                    <div>
                                      <p className="text-sm font-medium text-white/80">{result.judge_type || 'judge'}</p>
                                      <p className="text-[10px] text-white/30">
                                        {(result.judge_model || 'unknown').toString()} · {result.judge_model_version || 'v1'}
                                      </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                      {/* Score as visual bar */}
                                      <div className="flex items-center gap-2">
                                        <span className="text-xs text-white/40">Score</span>
                                        <div className="h-2 w-16 overflow-hidden rounded-full bg-white/[0.06]">
                                          <div className={cn('h-full rounded-full', scorePercent(result.score) >= 70 ? 'bg-emerald-500' : scorePercent(result.score) >= 40 ? 'bg-amber-500' : 'bg-red-500')} style={{ width: `${scorePercent(result.score)}%` }} />
                                        </div>
                                        <span className="font-mono text-xs text-white/60">{scoreLabel(result.score)}</span>
                                      </div>
                                      {/* Confidence as opacity gauge */}
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-xs text-white/40">Conf</span>
                                        <div className="flex gap-0.5">
                                          {[0.2, 0.4, 0.6, 0.8, 1.0].map((threshold) => (
                                            <div key={threshold} className={cn('h-3 w-1 rounded-sm', (typeof result.confidence === 'number' && result.confidence >= threshold) ? 'bg-primary' : 'bg-white/[0.06]')} />
                                          ))}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                  {((result.failure_tags ?? []).length > 0 || result.likert_label) && (
                                    <div className="mt-3 flex flex-wrap gap-1.5">
                                      {(result.failure_tags ?? []).map((tag) => (
                                        <span key={tag} className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-medium text-red-400">{tag}</span>
                                      ))}
                                      {result.likert_label && <span className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/50">{result.likert_label}</span>}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })
              )}
            </TabsContent>

            {/* ── Aura Judge ───────────────────────────── */}
            <TabsContent value="judge" className="space-y-6">
              <AuraJudgePanel
                projectId={projectId}
                onEvaluate={observabilityService.evaluateMediaWithAuraJudge}
              />
            </TabsContent>

            {/* ── Review ────────────────────────────────── */}
            <TabsContent value="review" className="space-y-6">
              {!data?.reviewTasks.length ? (
                <EmptyState icon={Eye} title="No review tasks" description="Threshold failures create review queue items here." />
              ) : (
                data.reviewTasks.map((task) => {
                  const targetType = isReviewTargetType(task.target_type) ? task.target_type : 'scene';
                  const color = getStatusColor(task.status);
                  return (
                    <motion.div key={task.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <Card className={cn('border-l-2 border-white/[0.06] bg-white/[0.02]', statusBorderClass[color])}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <CardTitle className="text-sm font-medium text-white">
                                {task.target_type} · <span className="font-mono text-white/50">{task.target_id.slice(0, 8)}</span>
                              </CardTitle>
                              <p className="mt-0.5 text-xs text-white/30">{task.summary || 'Manual review required'}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <StatusBadge status={task.status} />
                              {task.blocking && <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">blocking</span>}
                            </div>
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          <div className="grid gap-3 md:grid-cols-2">
                            <Textarea
                              value={notes[task.id] ?? ''}
                              onChange={(e) => setNotes((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              placeholder="Reviewer note…"
                              className="min-h-20 border-white/[0.06] bg-black/20 text-sm placeholder:text-white/20 focus:border-primary/30"
                            />
                            <Input
                              value={tags[task.id] ?? ''}
                              onChange={(e) => setTags((prev) => ({ ...prev, [task.id]: e.target.value }))}
                              placeholder="Reject tags, comma separated"
                              className="border-white/[0.06] bg-black/20 text-sm placeholder:text-white/20 focus:border-primary/30"
                            />
                          </div>
                          <div className="flex gap-2">
                            <Button size="sm" className="bg-emerald-600 text-white hover:bg-emerald-700" disabled={isSubmitting === task.id}
                              onClick={() => void submitReview(task.id, 'approve', targetType, task.target_id)}>
                              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" /> Approve
                            </Button>
                            <Button size="sm" variant="destructive" disabled={isSubmitting === task.id}
                              onClick={() => void submitReview(task.id, 'reject', targetType, task.target_id)}>
                              <XCircle className="mr-1.5 h-3.5 w-3.5" /> Reject
                            </Button>
                            <Button size="sm" variant="outline" className="border-white/[0.08] text-white/50 hover:text-white" disabled={isSubmitting === task.id}
                              onClick={() => void submitReview(task.id, 'annotate', targetType, task.target_id)}>
                              {isSubmitting === task.id && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />} Save note
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })
              )}

              {data?.reviewEvents.length ? (
                <Card className="border-white/[0.06] bg-white/[0.02]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-white">Recent review events</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1.5">
                    {data.reviewEvents.slice(0, 12).map((event) => (
                      <div key={event.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.02] px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <StatusIcon status={event.feedback_type === 'approve' ? 'completed' : event.feedback_type === 'reject' ? 'failed' : undefined} />
                          <div>
                            <p className="text-xs text-white/70">
                              <span className="font-medium">{event.feedback_type}</span> · {event.target_type} · <span className="font-mono">{event.target_id.slice(0, 8)}</span>
                            </p>
                            {event.note && <p className="text-[10px] text-white/30">{event.note}</p>}
                          </div>
                        </div>
                        <span className="text-[10px] text-white/20">{relativeTime(event.created_at)}</span>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            {/* ── Revision ──────────────────────────────── */}
            <TabsContent value="revision" className="space-y-4">
              {!data?.revisionPlans.length ? (
                <EmptyState icon={GitBranch} title="No revision plans" description="Rejected review tasks or failing evaluations will materialize revision plans here." />
              ) : (
                data.revisionPlans.map((plan) => {
                  const color = getStatusColor(plan.status);
                  return (
                    <motion.div key={plan.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
                      <Card className={cn('border-l-2 border-white/[0.06] bg-white/[0.02]', statusBorderClass[color])}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <CardTitle className="text-sm font-medium text-white">
                                {plan.target_type} · <span className="font-mono text-white/50">{plan.target_id.slice(0, 8)}</span>
                              </CardTitle>
                              <p className="mt-0.5 text-xs text-white/30">{relativeTime(plan.created_at)}</p>
                            </div>
                            <StatusBadge status={plan.status} />
                          </div>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2">
                          <div>
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">Trigger</p>
                            <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-[10px] leading-relaxed text-zinc-400">
                              {JSON.stringify(plan.trigger ?? {}, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30">Actions</p>
                            <pre className="overflow-x-auto rounded-lg bg-black/30 p-3 text-[10px] leading-relaxed text-zinc-400">
                              {JSON.stringify(plan.actions ?? [], null, 2)}
                            </pre>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })
              )}
            </TabsContent>

            {/* ── Narrative ─────────────────────────────── */}
            <TabsContent value="narrative" className="space-y-6">
              <div className="grid gap-6 lg:grid-cols-2">
                <Card className="border-white/[0.06] bg-white/[0.02]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-white">Narrative atoms</CardTitle>
                    <p className="text-xs text-white/30">Scene-level planned beats for storyline observability.</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {!data?.narrativeAtoms.length ? (
                      <p className="text-xs text-white/20">No narrative atoms persisted yet.</p>
                    ) : (
                      data.narrativeAtoms.map((atom) => (
                        <div key={atom.id} className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">{atom.beat_type}</span>
                            {atom.is_blocking && <span className="rounded-full border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-semibold text-red-400">blocking</span>}
                          </div>
                          <p className="mt-2 text-sm text-white/60">{atom.description}</p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>

                <Card className="border-white/[0.06] bg-white/[0.02]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-medium text-white">Story events</CardTitle>
                    <p className="text-xs text-white/30">Persistent narrative memory from generated story structure.</p>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {!data?.storyEvents.length ? (
                      <p className="text-xs text-white/20">No story events persisted yet.</p>
                    ) : (
                      data.storyEvents.map((event) => (
                        <div key={event.id} className="rounded-lg border border-white/[0.06] bg-black/20 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <Sparkles className="h-3.5 w-3.5 text-primary" />
                              <span className="text-sm font-medium text-white/70">{event.description}</span>
                            </div>
                            <span className="text-[10px] text-white/20">{relativeTime(event.created_at)}</span>
                          </div>
                          {(event.participants ?? []).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {event.participants.map((p: string) => (
                                <span key={p} className="rounded-full border border-white/[0.08] bg-white/[0.04] px-2 py-0.5 text-[10px] text-white/40">{p}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </div>
  );
};

export default ProjectObservabilityPage;
