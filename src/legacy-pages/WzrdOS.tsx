import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  CheckCircle2,
  Clock3,
  Command,
  History,
  Loader2,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  TriangleAlert,
} from "lucide-react";

import AppShell from "@/components/layout/AppShell";
import { usePostzChannels } from "@/hooks/usePostz";
import {
  approveWzrdOsPlan,
  type WzrdOsPlan,
  type WzrdOsPlanStep,
  type WzrdOsRisk,
  type WzrdOsRunEvent,
  type WzrdOsStepStatus,
} from "@/features/wzrdos/plan";
import { wzrdOsService, type WzrdOsRunHistoryItem } from "@/features/wzrdos/service";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
};

type HistoryItem = WzrdOsRunHistoryItem;

const SUGGESTIONS = [
  "Generate 10 pieces of content, scrape 10 pieces based on Sourcify, and schedule them for posting on Postz.",
  "Generate 6 social clips, scrape 6 TikTok and YouTube references, then queue the posts.",
  "Scrape 8 Instagram Reels references and schedule 8 Postz drafts for connected channels.",
];

const STATUS_LABELS: Record<WzrdOsStepStatus, string> = {
  pending: "Pending",
  needs_approval: "Approval",
  approved: "Approved",
  running: "Running",
  succeeded: "Done",
  failed: "Failed",
  skipped: "Skipped",
};

const STATUS_CLASSNAMES: Record<WzrdOsStepStatus, string> = {
  pending: "border-zinc-700 bg-zinc-900/70 text-zinc-300",
  needs_approval: "border-amber-400/30 bg-amber-500/10 text-amber-200",
  approved: "border-cyan-400/30 bg-cyan-500/10 text-cyan-200",
  running: "border-orange-400/30 bg-orange-500/10 text-orange-200",
  succeeded: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200",
  failed: "border-red-400/30 bg-red-500/10 text-red-200",
  skipped: "border-zinc-700 bg-zinc-900/70 text-zinc-400",
};

const RISK_CLASSNAMES: Record<WzrdOsRisk, string> = {
  read: "border-sky-400/25 bg-sky-500/10 text-sky-200",
  credits: "border-amber-400/25 bg-amber-500/10 text-amber-200",
  publish: "border-rose-400/25 bg-rose-500/10 text-rose-200",
};

function createMessageId(): string {
  const randomId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2, 12);
  return `msg_${randomId}`;
}

function cn(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function formatToolInput(input: WzrdOsPlanStep["input"]): string {
  return Object.entries(input)
    .map(([key, value]) => {
      const rendered = Array.isArray(value) ? value.join(", ") : String(value);
      return `${key}: ${rendered}`;
    })
    .join(" | ");
}

function statusIcon(status: WzrdOsStepStatus) {
  if (status === "running") return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />;
  if (status === "succeeded") return <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />;
  if (status === "needs_approval" || status === "approved") {
    return <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  return <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />;
}

function StepCard({ step }: { step: WzrdOsPlanStep }) {
  return (
    <article className="border border-white/10 bg-zinc-950/55 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-zinc-100">{step.title}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-400">{step.description}</p>
        </div>
        <span
          className={cn(
            "inline-flex h-7 shrink-0 items-center gap-1.5 border px-2 text-xs font-medium",
            STATUS_CLASSNAMES[step.status],
          )}
        >
          {statusIcon(step.status)}
          {STATUS_LABELS[step.status]}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <span className="border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-zinc-300">
          {step.toolName}
        </span>
        <span className="border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-zinc-400">
          {step.target}
        </span>
        {step.risks.map((risk) => (
          <span key={risk} className={cn("border px-2 py-1 text-xs", RISK_CLASSNAMES[risk])}>
            {risk}
          </span>
        ))}
      </div>

      <p className="mt-3 break-words text-xs leading-5 text-zinc-500">{formatToolInput(step.input)}</p>
      {step.skillRefs.length > 0 ? (
        <p className="mt-2 text-xs text-zinc-500">Skills: {step.skillRefs.join(", ")}</p>
      ) : null}
    </article>
  );
}

function PlanPanel({
  plan,
  approved,
  running,
  onApprove,
  onRun,
}: {
  plan: WzrdOsPlan | null;
  approved: boolean;
  running: boolean;
  onApprove: () => void;
  onRun: () => void;
}) {
  if (!plan) {
    return (
      <section className="flex min-h-[360px] flex-col justify-between border border-white/10 bg-zinc-950/45 p-5">
        <div>
          <div className="flex h-10 w-10 items-center justify-center border border-white/10 bg-white/[0.03] text-zinc-400">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
          </div>
          <h2 className="mt-5 text-lg font-semibold text-zinc-100">Plan</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">No active plan.</p>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs text-zinc-500">
          <span className="border border-white/10 bg-black/20 px-2 py-3">Generate</span>
          <span className="border border-white/10 bg-black/20 px-2 py-3">Scrape</span>
          <span className="border border-white/10 bg-black/20 px-2 py-3">Schedule</span>
        </div>
      </section>
    );
  }

  return (
    <section className="border border-white/10 bg-zinc-950/45">
      <div className="border-b border-white/10 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Plan</h2>
            <p className="mt-1 text-sm text-zinc-400">{plan.summary}</p>
          </div>
          <span className="border border-orange-400/25 bg-orange-500/10 px-3 py-1.5 text-xs font-medium text-orange-200">
            {plan.totals.estimatedCredits}/{plan.totals.creditCeiling} credits
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 text-center text-xs">
          <span className="border border-white/10 bg-black/20 px-2 py-3 text-zinc-300">
            {plan.totals.generatedItems} generated
          </span>
          <span className="border border-white/10 bg-black/20 px-2 py-3 text-zinc-300">
            {plan.totals.scrapedItems} scraped
          </span>
          <span className="border border-white/10 bg-black/20 px-2 py-3 text-zinc-300">
            {plan.totals.scheduledPosts} scheduled
          </span>
        </div>

        {plan.warnings.length > 0 ? (
          <div className="mt-4 space-y-2">
            {plan.warnings.map((warning) => (
              <div key={warning} className="flex gap-2 border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                <span>{warning}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-3 p-5">
        {plan.steps.map((step) => (
          <StepCard key={step.id} step={step} />
        ))}
      </div>

      <div className="flex flex-col gap-2 border-t border-white/10 p-5 sm:flex-row">
        <button
          type="button"
          onClick={onApprove}
          disabled={approved || running}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-cyan-400/30 bg-cyan-500/10 px-4 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {approved ? "Approved" : "Approve plan"}
        </button>
        <button
          type="button"
          onClick={onRun}
          disabled={!approved || running}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 border border-orange-400/35 bg-orange-500/15 px-4 text-sm font-medium text-orange-100 transition-colors hover:bg-orange-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {running ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
          Run dry run
        </button>
      </div>
    </section>
  );
}

function HistoryPanel({ history }: { history: HistoryItem[] }) {
  return (
    <section className="border border-white/10 bg-zinc-950/45 p-5">
      <div className="mb-4 flex items-center gap-2">
        <History className="h-4 w-4 text-zinc-400" aria-hidden="true" />
        <h2 className="text-sm font-semibold text-zinc-100">History</h2>
      </div>
      {history.length === 0 ? (
        <p className="text-sm text-zinc-500">No runs yet.</p>
      ) : (
        <div className="space-y-2">
          {history.slice(0, 8).map((run) => (
            <article key={run.id} className="border border-white/10 bg-black/20 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm text-zinc-200">{run.summary}</p>
                <span className="border border-emerald-400/25 bg-emerald-500/10 px-2 py-1 text-xs text-emerald-200">
                  {run.mode}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">{new Date(run.created_at).toLocaleString()}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

export default function WzrdOS() {
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>(() => [
    {
      id: createMessageId(),
      role: "assistant",
      content: "WZRDOS online.",
      createdAt: new Date().toISOString(),
    },
  ]);
  const [plan, setPlan] = useState<WzrdOsPlan | null>(null);
  const [approvedPlanId, setApprovedPlanId] = useState<string | null>(null);
  const [isPlanning, setIsPlanning] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const runSequenceRef = useRef(0);
  const channelsQuery = usePostzChannels({ enabled: true });

  const connectedChannelCount = useMemo(
    () => (channelsQuery.data ?? []).filter((channel) => channel.status === "connected" && !channel.disabled).length,
    [channelsQuery.data],
  );

  const approved = Boolean(plan && approvedPlanId === plan.id);

  useEffect(() => {
    let mounted = true;
    void wzrdOsService.listRuns().then((runs) => {
      if (mounted) setHistory(runs);
    });
    return () => {
      mounted = false;
      runSequenceRef.current += 1;
    };
  }, []);

  const addMessage = (role: ChatMessage["role"], content: string) => {
    setMessages((current) => [
      ...current,
      {
        id: createMessageId(),
        role,
        content,
        createdAt: new Date().toISOString(),
      },
    ]);
  };

  const submitPrompt = async (override?: string) => {
    const prompt = (override ?? input).trim();
    if (!prompt || isPlanning) return;

    setInput("");
    setIsPlanning(true);
    setApprovedPlanId(null);
    addMessage("user", prompt);

    try {
      const nextPlan = await wzrdOsService.planCommand({
        prompt,
        context: {
          connectedChannelCount,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        },
      });
      setPlan(nextPlan);
      addMessage("assistant", nextPlan.summary);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to plan command.";
      addMessage("assistant", message);
    } finally {
      setIsPlanning(false);
    }
  };

  const handleApprove = () => {
    if (!plan) return;
    const approvedPlan = approveWzrdOsPlan(plan);
    setPlan(approvedPlan);
    setApprovedPlanId(approvedPlan.id);
    addMessage("assistant", "Plan approved.");
  };

  const applyRunEvent = (event: WzrdOsRunEvent) => {
    if (!event.stepId) return;
    setPlan((current) => {
      if (!current) return current;
      return {
        ...current,
        steps: current.steps.map((step) => {
          if (step.id !== event.stepId) return step;
          if (event.type === "step.started") return { ...step, status: "running" };
          if (event.type === "step.completed") return { ...step, status: "succeeded" };
          return step;
        }),
      };
    });
  };

  const runApprovedPlan = async () => {
    if (!plan || !approved || isRunning) return;
    const sequence = runSequenceRef.current + 1;
    runSequenceRef.current = sequence;
    setIsRunning(true);

    try {
      const run = await wzrdOsService.runPreview(plan);
      const historyItem: HistoryItem = {
        id: run.id,
        plan_id: run.planId,
        status: run.status,
        mode: run.mode,
        summary: run.summary,
        created_at: run.startedAt,
        completed_at: run.completedAt,
        events: run.events,
      };
      setHistory((current) => [historyItem, ...current]);

      for (const event of run.events) {
        if (runSequenceRef.current !== sequence) return;
        applyRunEvent(event);
        await sleep(180);
      }

      addMessage("assistant", run.summary);
    } finally {
      if (runSequenceRef.current === sequence) setIsRunning(false);
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void submitPrompt();
  };

  return (
    <AppShell activeView="wzrdos" contentClassName="px-4 py-5 md:px-8 md:py-8">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center border border-orange-400/25 bg-orange-500/10 text-orange-200">
              <Command className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-zinc-500">WZRDOS</p>
              <h1 className="text-2xl font-semibold text-zinc-50 md:text-3xl">Command center</h1>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            <span className="border border-white/10 bg-white/[0.03] px-3 py-2 text-zinc-300">
              {channelsQuery.isLoading ? "Channels loading" : `${connectedChannelCount} channels`}
            </span>
            <span className="border border-white/10 bg-white/[0.03] px-3 py-2 text-zinc-300">
              Dry run default
            </span>
          </div>
        </header>

        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_480px]">
          <section className="flex min-h-[calc(100vh-12rem)] flex-col border border-white/10 bg-zinc-950/80">
            <div className="flex-1 space-y-4 overflow-y-auto p-4 md:p-5">
              {messages.map((message) => (
                <article
                  key={message.id}
                  className={cn(
                    "max-w-[86%] border px-4 py-3",
                    message.role === "user"
                      ? "ml-auto border-orange-400/25 bg-orange-500/10 text-orange-50"
                      : "border-white/10 bg-white/[0.03] text-zinc-100",
                  )}
                >
                  <p className="whitespace-pre-wrap text-sm leading-6">{message.content}</p>
                  <p className="mt-2 text-xs text-zinc-500">
                    {new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </article>
              ))}
              {isPlanning ? (
                <div className="inline-flex items-center gap-2 border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-zinc-300">
                  <Loader2 className="h-4 w-4 animate-spin text-orange-200" aria-hidden="true" />
                  Planning
                </div>
              ) : null}
            </div>

            <div className="border-t border-white/10 p-4 md:p-5">
              <div className="mb-3 flex flex-wrap gap-2">
                {SUGGESTIONS.map((suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    onClick={() => void submitPrompt(suggestion)}
                    disabled={isPlanning || isRunning}
                    className="min-h-10 border border-white/10 bg-white/[0.03] px-3 text-left text-xs text-zinc-300 transition-colors hover:border-orange-400/35 hover:bg-orange-500/10 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
              <form onSubmit={handleSubmit} className="flex gap-2">
                <label htmlFor="wzrdos-command" className="sr-only">
                  WZRDOS command
                </label>
                <textarea
                  id="wzrdos-command"
                  value={input}
                  onChange={(event) => setInput(event.target.value)}
                  rows={2}
                  placeholder="Ask WZRDOS..."
                  className="min-h-14 flex-1 resize-none border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-100 outline-none transition-colors placeholder:text-zinc-600 focus:border-orange-400/45"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isPlanning || isRunning}
                  className="inline-flex min-h-14 w-14 shrink-0 items-center justify-center border border-orange-400/35 bg-orange-500/15 text-orange-100 transition-colors hover:bg-orange-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Send WZRDOS command"
                >
                  {isPlanning ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <Send className="h-5 w-5" aria-hidden="true" />}
                </button>
              </form>
            </div>
          </section>

          <aside className="space-y-5">
            <PlanPanel
              plan={plan}
              approved={approved}
              running={isRunning}
              onApprove={handleApprove}
              onRun={() => void runApprovedPlan()}
            />
            <HistoryPanel history={history} />
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
