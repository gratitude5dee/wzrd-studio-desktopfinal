export type WzrdOsToolName =
  | "generate_content"
  | "scrape_sources"
  | "schedule_posts"
  | "list_assets"
  | "list_channels"
  | "get_credits";

export type WzrdOsStepStatus =
  | "pending"
  | "needs_approval"
  | "approved"
  | "running"
  | "succeeded"
  | "failed"
  | "skipped";

export type WzrdOsRisk = "read" | "credits" | "publish";
export type WzrdOsToolInput = Record<string, string | number | boolean | string[] | number[] | null>;

export interface WzrdOsPlanStep {
  id: string;
  title: string;
  description: string;
  toolName: WzrdOsToolName;
  target: string;
  skillRefs: string[];
  input: WzrdOsToolInput;
  status: WzrdOsStepStatus;
  risks: WzrdOsRisk[];
  requiresApproval: boolean;
  estimatedCredits: number;
}

export interface WzrdOsPlan {
  id: string;
  prompt: string;
  summary: string;
  createdAt: string;
  steps: WzrdOsPlanStep[];
  totals: {
    generatedItems: number;
    scrapedItems: number;
    scheduledPosts: number;
    estimatedCredits: number;
    creditCeiling: number;
    connectedChannels: number;
  };
  warnings: string[];
  safety: {
    maxGeneratedItems: number;
    maxScrapedItems: number;
    maxScheduledPosts: number;
    publishConfirmationRequired: boolean;
    creditApprovalRequired: boolean;
    dryRunDefault: boolean;
  };
}

export interface WzrdOsPlanContext {
  connectedChannelCount?: number;
  timezone?: string;
}

export type WzrdOsRunEventType = "run.created" | "step.started" | "step.completed" | "run.completed";

export interface WzrdOsRunEvent {
  id: string;
  type: WzrdOsRunEventType;
  stepId?: string;
  message: string;
  timestamp: string;
}

export interface WzrdOsRunPreview {
  id: string;
  planId: string;
  mode: "dry_run";
  status: "succeeded";
  summary: string;
  events: WzrdOsRunEvent[];
  startedAt: string;
  completedAt: string;
  persisted?: boolean;
}

const MAX_GENERATED_ITEMS = 20;
const MAX_SCRAPED_ITEMS = 20;
const MAX_SCHEDULED_POSTS = 40;
const CREDIT_CEILING = 80;
const DEFAULT_GENERATED_ITEMS = 3;
const DEFAULT_SCRAPED_ITEMS = 5;
const DEFAULT_SCHEDULED_POSTS = 3;
const DEFAULT_PLATFORMS = ["youtube", "tiktok", "instagram"];

const GENERATE_VERBS = ["generate", "create", "make", "produce", "draft"];
const SCRAPE_VERBS = ["scrape", "source", "find", "collect", "research"];
const SCHEDULE_VERBS = ["schedule", "queue", "post"];

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID()}`;
}

function hasAnyWord(input: string, words: string[]): boolean {
  return words.some((word) => new RegExp(`\\b${word}\\b`, "i").test(input));
}

function extractCountNearVerb(input: string, verbs: string[]): number | null {
  const verbGroup = verbs.join("|");
  const afterVerb = new RegExp(`\\b(?:${verbGroup})\\b[^0-9]{0,48}(\\d{1,3})`, "i").exec(input);
  if (afterVerb?.[1]) return Number(afterVerb[1]);

  const beforeVerb = new RegExp(`(\\d{1,3})\\s+(?:pieces?|items?|posts?|clips?|videos?|images?)?\\s*(?:of\\s+)?\\b(?:${verbGroup})\\b`, "i").exec(input);
  if (beforeVerb?.[1]) return Number(beforeVerb[1]);

  return null;
}

function clampRequestedCount(requested: number, max: number, label: string, warnings: string[]): number {
  if (requested <= max) return Math.max(0, requested);
  warnings.push(`${label} capped at ${max} for this run.`);
  return max;
}

function detectPlatforms(prompt: string): string[] {
  const platforms = [
    ["youtube", /youtube|shorts/i],
    ["tiktok", /tiktok/i],
    ["instagram", /instagram|reels/i],
    ["twitch", /twitch/i],
  ]
    .filter(([, pattern]) => (pattern as RegExp).test(prompt))
    .map(([platform]) => platform);

  return platforms.length > 0 ? platforms : DEFAULT_PLATFORMS;
}

function detectContentKind(prompt: string): string {
  if (/storyboard|shot/i.test(prompt)) return "storyboard_shot";
  if (/image|photo|still/i.test(prompt)) return "image";
  if (/video|clip|reel|short/i.test(prompt)) return "social_clip";
  return "social_content";
}

function summarizePlan(generated: number, scraped: number, scheduled: number): string {
  const phrases: string[] = [];
  if (generated > 0) phrases.push(`generate ${generated}`);
  if (scraped > 0) phrases.push(`scrape ${scraped}`);
  if (scheduled > 0) phrases.push(`schedule ${scheduled}`);
  return phrases.length > 0 ? `Plan ready: ${phrases.join(" -> ")}.` : "Plan ready: review workspace context.";
}

export function buildWzrdOsPlan(prompt: string, context: WzrdOsPlanContext = {}): WzrdOsPlan {
  const command = prompt.trim();
  const warnings: string[] = [];
  const hasGenerate = hasAnyWord(command, GENERATE_VERBS);
  const hasScrape = hasAnyWord(command, SCRAPE_VERBS) || /\bsourcify\b/i.test(command);
  const hasSchedule = hasAnyWord(command, SCHEDULE_VERBS) || /\bpostz\b/i.test(command);

  const requestedGenerated = extractCountNearVerb(command, GENERATE_VERBS) ?? (hasGenerate ? DEFAULT_GENERATED_ITEMS : 0);
  const requestedScraped = extractCountNearVerb(command, SCRAPE_VERBS) ?? (hasScrape ? DEFAULT_SCRAPED_ITEMS : 0);
  const generatedItems = clampRequestedCount(requestedGenerated, MAX_GENERATED_ITEMS, "Generated content", warnings);
  const scrapedItems = clampRequestedCount(requestedScraped, MAX_SCRAPED_ITEMS, "Sourcify scrape", warnings);
  const requestedScheduled =
    extractCountNearVerb(command, SCHEDULE_VERBS) ??
    (hasSchedule ? generatedItems + scrapedItems || DEFAULT_SCHEDULED_POSTS : 0);
  const scheduledPosts = clampRequestedCount(requestedScheduled, MAX_SCHEDULED_POSTS, "Scheduled posts", warnings);
  const connectedChannels = Math.max(0, Number(context.connectedChannelCount ?? 0));
  const steps: WzrdOsPlanStep[] = [];

  if (generatedItems > 0) {
    steps.push({
      id: "generate-content",
      title: `Generate ${generatedItems} content ${generatedItems === 1 ? "item" : "items"}`,
      description: "Run the Studio generation stack and collect the outputs as reusable assets.",
      toolName: "generate_content",
      target: "compute-execute / kanvas-generate",
      skillRefs: ["run-studio-graph", "generate-shot"],
      input: { n: generatedItems, brief: command, kind: detectContentKind(command) },
      status: "needs_approval",
      risks: ["credits"],
      requiresApproval: true,
      estimatedCredits: generatedItems * 4,
    });
  }

  if (scrapedItems > 0) {
    steps.push({
      id: "scrape-sources",
      title: `Scrape ${scrapedItems} source ${scrapedItems === 1 ? "item" : "items"}`,
      description: "Ask Sourcify to gather reference material across the selected platforms.",
      toolName: "scrape_sources",
      target: "sourcify-apify",
      skillRefs: [],
      input: { n: scrapedItems, query: command, platforms: detectPlatforms(command) },
      status: "pending",
      risks: ["read"],
      requiresApproval: false,
      estimatedCredits: 0,
    });
  }

  if (scheduledPosts > 0) {
    steps.push({
      id: "schedule-posts",
      title: `Schedule ${scheduledPosts} Postz ${scheduledPosts === 1 ? "post" : "posts"}`,
      description: "Prepare queued Postz items for connected channels; publishing remains separately confirmed.",
      toolName: "schedule_posts",
      target: "postz-posts",
      skillRefs: [],
      input: {
        items: scheduledPosts,
        channels: connectedChannels > 0 ? "connected" : "selected",
        channel_count: connectedChannels,
        when: context.timezone ? `next_available:${context.timezone}` : "next_available",
      },
      status: "needs_approval",
      risks: ["publish"],
      requiresApproval: true,
      estimatedCredits: 0,
    });
  }

  if (steps.length === 0) {
    steps.push({
      id: "review-context",
      title: "Review workspace context",
      description: "Read assets, channels, and credit state before planning a live operation.",
      toolName: "list_assets",
      target: "project-assets / postz-channels / credits",
      skillRefs: ["list-models"],
      input: { prompt: command || "workspace status" },
      status: "pending",
      risks: ["read"],
      requiresApproval: false,
      estimatedCredits: 0,
    });
  }

  const estimatedCredits = steps.reduce((total, step) => total + step.estimatedCredits, 0);
  if (estimatedCredits > CREDIT_CEILING) warnings.push(`Estimated credits exceed the ${CREDIT_CEILING}-credit ceiling.`);
  if (scheduledPosts > 0) warnings.push("Publishing requires a separate confirmation after scheduling.");
  if (scheduledPosts > 0 && connectedChannels === 0) warnings.push("No connected Postz channels were detected for the schedule step.");

  return {
    id: createId("wzrdos_plan"),
    prompt: command,
    summary: summarizePlan(generatedItems, scrapedItems, scheduledPosts),
    createdAt: new Date().toISOString(),
    steps,
    totals: {
      generatedItems,
      scrapedItems,
      scheduledPosts,
      estimatedCredits,
      creditCeiling: CREDIT_CEILING,
      connectedChannels,
    },
    warnings,
    safety: {
      maxGeneratedItems: MAX_GENERATED_ITEMS,
      maxScrapedItems: MAX_SCRAPED_ITEMS,
      maxScheduledPosts: MAX_SCHEDULED_POSTS,
      publishConfirmationRequired: scheduledPosts > 0,
      creditApprovalRequired: estimatedCredits > 0,
      dryRunDefault: true,
    },
  };
}

export function createWzrdOsRunPreview(plan: WzrdOsPlan): WzrdOsRunPreview {
  const startedAt = new Date();
  const events: WzrdOsRunEvent[] = [
    {
      id: createId("evt"),
      type: "run.created",
      message: "Dry run created.",
      timestamp: startedAt.toISOString(),
    },
  ];

  plan.steps.forEach((step, index) => {
    events.push({
      id: createId("evt"),
      type: "step.started",
      stepId: step.id,
      message: `${step.toolName} checked.`,
      timestamp: new Date(startedAt.getTime() + (index * 2 + 1) * 1000).toISOString(),
    });
    events.push({
      id: createId("evt"),
      type: "step.completed",
      stepId: step.id,
      message: `${step.title} is ready for live execution.`,
      timestamp: new Date(startedAt.getTime() + (index * 2 + 2) * 1000).toISOString(),
    });
  });

  const completedAt = new Date(startedAt.getTime() + (plan.steps.length * 2 + 3) * 1000);
  events.push({
    id: createId("evt"),
    type: "run.completed",
    message: "Dry run completed.",
    timestamp: completedAt.toISOString(),
  });

  return {
    id: createId("wzrdos_run"),
    planId: plan.id,
    mode: "dry_run",
    status: "succeeded",
    summary: `${plan.summary} Dry run complete.`,
    events,
    startedAt: startedAt.toISOString(),
    completedAt: completedAt.toISOString(),
  };
}
