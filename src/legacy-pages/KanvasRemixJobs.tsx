import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileArchive,
  Loader2,
  RefreshCw,
  RotateCcw,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cancelRemixJob, getRemixJob, retryRemixRender } from '@/features/remix/service';
import type { RemixJobWithRenders, RemixRender } from '@/features/remix/types';
import { getTemplate } from '@/features/kanvas-lyrics/service';
import type { KanvasLyricTemplate } from '@/features/kanvas-lyrics/types';
import { cn } from '@/lib/utils';

const KanvasRemixJobs = () => {
  const navigate = useNavigate();
  const { jobId } = useParams<{ jobId: string }>();
  const [jobState, setJobState] = useState<RemixJobWithRenders | null>(null);
  const [template, setTemplate] = useState<KanvasLyricTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    const load = async () => {
      try {
        const next = await getRemixJob(jobId);
        if (cancelled) return;
        setJobState(next);
        getTemplate(next.job.templateId)
          .then((row) => {
            if (!cancelled) setTemplate(row);
          })
          .catch(() => {});
      } catch (error) {
        if (!cancelled) toast.error(error instanceof Error ? error.message : 'Failed to load Remix job');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [jobId]);

  const progress = useMemo(() => {
    if (!jobState?.renders.length) return 0;
    return jobState.renders.reduce((sum, render) => sum + render.progress, 0) / jobState.renders.length;
  }, [jobState]);

  const doneCount = jobState?.renders.filter((render) => render.status === 'done').length ?? 0;

  const handleCancel = async () => {
    if (!jobId || !confirm('Cancel this Remix job?')) return;
    setCancelling(true);
    try {
      await cancelRemixJob(jobId);
      const next = await getRemixJob(jobId);
      setJobState(next);
      toast.success('Job cancelled');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to cancel job');
    } finally {
      setCancelling(false);
    }
  };

  const handleDownloadAll = () => {
    const outputs = jobState?.renders.filter((render) => render.outputUrl) ?? [];
    outputs.forEach((render, index) => {
      window.setTimeout(() => {
        const anchor = document.createElement('a');
        anchor.href = render.outputUrl!;
        anchor.download = `kanvas-remix-${index + 1}.mp4`;
        anchor.click();
      }, index * 120);
    });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black text-white">
        <Loader2 className="h-6 w-6 animate-spin text-cyan-300" />
      </div>
    );
  }

  if (!jobState) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-black p-6 text-center text-white">
        <div>
          <XCircle className="mx-auto h-8 w-8 text-rose-300" />
          <h1 className="mt-4 text-xl font-black">Remix job not found</h1>
          <button
            type="button"
            onClick={() => navigate('/kanvas/remix')}
            className="mt-5 rounded-full bg-cyan-400 px-5 py-2 text-xs font-bold uppercase tracking-[0.18em] text-black"
          >
            Back to Remix
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black px-6 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <button
          type="button"
          onClick={() => navigate(`/kanvas/remix/${jobState.job.templateId}`)}
          className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-slate-300 hover:bg-white/10"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Remix
        </button>

        <header className="mt-6 rounded-2xl border border-cyan-400/15 bg-[#05080D] p-6">
          <div className="grid gap-5 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-cyan-300">Remix render job</p>
              <h1 className="mt-2 text-3xl font-black text-white">{template?.title ?? 'Lyric template'}</h1>
              <p className="mt-1 text-sm text-slate-400">
                {jobState.job.quantity} output{jobState.job.quantity === 1 ? '' : 's'} · {doneCount} complete · {jobState.job.creditCost} credits
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleDownloadAll}
                disabled={doneCount === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-cyan-400 px-4 py-2 text-sm font-bold text-black disabled:cursor-not-allowed disabled:opacity-50"
              >
                <FileArchive className="h-4 w-4" />
                Download All
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={cancelling || jobState.job.status === 'cancelled'}
                className="inline-flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-400/10 px-4 py-2 text-sm font-bold text-rose-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {cancelling ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />}
                Cancel
              </button>
            </div>
          </div>

          <div className="mt-6">
            <div className="mb-2 flex justify-between text-xs uppercase tracking-[0.16em] text-slate-500">
              <span>Overall progress</span>
              <span className="text-cyan-200">{Math.round(progress * 100)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full bg-gradient-to-r from-emerald-400 to-cyan-300 transition-[width]"
                style={{ width: `${Math.round(progress * 100)}%` }}
              />
            </div>
          </div>
        </header>

        <section className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {jobState.renders.map((render, index) => (
            <RenderCard key={render.id} render={render} index={index} onRetry={async () => {
              try {
                await retryRemixRender(render.id);
                if (jobId) setJobState(await getRemixJob(jobId));
                toast.success('Render retried');
              } catch (error) {
                toast.error(error instanceof Error ? error.message : 'Retry failed');
              }
            }} />
          ))}
        </section>
      </div>
    </div>
  );
};

function RenderCard({
  render,
  index,
  onRetry,
}: {
  render: RemixRender;
  index: number;
  onRetry: () => Promise<void>;
}) {
  const isDone = render.status === 'done';
  const isFailed = render.status === 'failed';
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#070A10]">
      <div className="relative aspect-video bg-black">
        {render.thumbnailUrl ? (
          <img src={render.thumbnailUrl} alt="" className="h-full w-full object-cover opacity-80" />
        ) : (
          <div className="flex h-full items-center justify-center text-slate-600">
            <RefreshCw className={cn('h-7 w-7', !isDone && !isFailed && 'animate-spin')} />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-black/70 px-2 py-1 text-xs font-bold">
          {index + 1}
        </span>
        <span
          className={cn(
            'absolute right-3 top-3 inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-[0.12em]',
            isDone && 'bg-emerald-400/15 text-emerald-200',
            isFailed && 'bg-rose-400/15 text-rose-200',
            !isDone && !isFailed && 'bg-cyan-400/15 text-cyan-200'
          )}
        >
          {isDone && <CheckCircle2 className="h-3 w-3" />}
          {render.status}
        </span>
      </div>

      <div className="p-4">
        <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className={cn('h-full transition-[width]', isFailed ? 'bg-rose-400' : 'bg-cyan-300')}
            style={{ width: `${Math.round(render.progress * 100)}%` }}
          />
        </div>
        {render.error && <p className="mt-2 text-xs text-rose-300">{render.error}</p>}

        <div className="mt-4 flex gap-2">
          {isDone && render.outputUrl ? (
            <a
              href={render.outputUrl}
              download={`kanvas-remix-${index + 1}.mp4`}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg bg-cyan-400 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-black"
            >
              <Download className="h-3.5 w-3.5" />
              Download MP4
            </a>
          ) : (
            <button
              type="button"
              onClick={onRetry}
              disabled={!isFailed}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Retry
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default KanvasRemixJobs;
