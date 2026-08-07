import { useCallback, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  DatabaseZap,
  Download,
  ExternalLink,
  Loader2,
  Play,
  Plus,
  Search,
  Sparkles,
  Settings2,
} from "lucide-react";
import { toast } from "sonner";

import { MobileBottomNav } from "@/components/home/MobileBottomNav";
import { Sidebar } from "@/components/home/Sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useSidebar } from "@/contexts/SidebarContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { appRoutes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import {
  downloadSourcifyResults,
  finalizeSourcifyResults,
  planSourcifyTopic,
  runSourcifyActor,
} from "@/features/sourcify/sourcify-client";
import {
  DEFAULT_SOURCIFY_SETTINGS,
  groupSourcifyResults,
  type SourcifyActorPlan,
  type SourcifyPlan,
  type SourcifyPlatform,
  type SourcifyResult,
  type SourcifyRunResponse,
  type SourcifySettings,
} from "@/features/sourcify/sourcify-model";

type BusyState = "idle" | "planning" | "running" | "saving" | "downloading";

type PlatformFilter = "all" | SourcifyPlatform;

const categoryLabels: Record<SourcifyResult["category"], string> = {
  video: "Videos",
  short: "Shorts",
  reel: "Reels",
  clip: "Clips",
  profile: "Profiles",
  metadata: "Metadata",
};

function metric(value?: number) {
  if (!value) return "-";
  return Intl.NumberFormat(undefined, { notation: value > 9999 ? "compact" : "standard" }).format(value);
}

function ActorButton({
  actor,
  selected,
  onToggle,
}: {
  actor: SourcifyActorPlan;
  selected: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={selected}
      disabled={!actor.configured}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-orange-400/50 bg-orange-500/10 text-orange-100"
          : "border-white/10 bg-white/[0.03] text-zinc-200 hover:border-white/20 hover:bg-white/[0.06]",
        !actor.configured && "cursor-not-allowed opacity-60 hover:border-white/10 hover:bg-white/[0.03]",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-semibold">{actor.label}</span>
            <Badge variant="secondary" className="border-white/10 bg-white/5 text-[10px] uppercase text-zinc-300">
              {actor.platform}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-xs text-zinc-400">{actor.reason}</p>
        </div>
        {selected ? (
          <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-orange-200" />
        ) : actor.configured ? (
          <span className="h-4 w-4 flex-shrink-0 rounded-full border border-white/20" />
        ) : (
          <AlertCircle className="h-4 w-4 flex-shrink-0 text-amber-300" />
        )}
      </div>
      {actor.notes && actor.notes.length > 0 && (
        <p className="mt-2 line-clamp-2 text-xs text-zinc-500">{actor.notes.join(" ")}</p>
      )}
    </button>
  );
}

function youtubeVideoIdFromUrl(url: string): string | undefined {
  if (!url) return undefined;
  try {
    const parsed = new URL(url);
    const host = parsed.host.toLowerCase();
    if (host.includes("youtu.be")) {
      const id = parsed.pathname.split("/").filter(Boolean)[0];
      return id || undefined;
    }
    if (parsed.pathname.startsWith("/shorts/")) {
      const id = parsed.pathname.split("/").filter(Boolean)[1];
      return id || undefined;
    }
    const v = parsed.searchParams.get("v");
    return v || undefined;
  } catch {
    return undefined;
  }
}

function youtubeHoverEmbedUrl(url: string): string | undefined {
  const id = youtubeVideoIdFromUrl(url);
  if (!id) return undefined;
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "1",
    controls: "0",
    rel: "0",
    playsinline: "1",
    modestbranding: "1",
  });
  return `https://www.youtube-nocookie.com/embed/${id}?${params.toString()}`;
}


function isTikTokVideoUrl(sourceUrl: string): boolean {
  if (!sourceUrl) return false;
  return (
    /tiktok\.com\/@[^/]+\/video\//i.test(sourceUrl) ||
    /vm\.tiktok\.com\//i.test(sourceUrl) ||
    /tiktok\.com\/t\//i.test(sourceUrl)
  );
}


function isDirectMediaUrl(url: unknown): boolean {
  if (!url || typeof url !== "string") return false;
  const lower = url.toLowerCase();
  if (/\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)) return true;
  // YouTube downloader URLs are often googlevideo videoplayback streams.
  if (lower.includes("googlevideo.com/videoplayback")) return true;
  // Some CDNs don't end with .mp4 but include a clear mp4 hint.
  if (lower.includes("mp4") && (lower.includes("cdn") || lower.includes("fbcdn") || lower.includes("tiktok"))) return true;
  return false;
}

function isYoutubeVideoUrl(sourceUrl: string): boolean {
  if (!sourceUrl) return false;
  return /watch\?v=|\/shorts\/|youtu\.be\/|\/embed\/|\/live\//i.test(sourceUrl);
}

function isInstagramVideoUrl(sourceUrl: string): boolean {
  if (!sourceUrl) return false;
  return /instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\//i.test(sourceUrl);
}

function canRequestMp4(result: SourcifyResult): boolean {
  const sourceUrl = typeof result.sourceUrl === "string" ? result.sourceUrl : "";
  if (!sourceUrl) return false;
  switch (result.platform) {
    case "youtube":
      return isYoutubeVideoUrl(sourceUrl);
    case "instagram":
      return isInstagramVideoUrl(sourceUrl);
    case "tiktok":
      return isTikTokVideoUrl(sourceUrl);
    default:
      return false;
  }
}


function ResultCard({
  result,
  selected,
  onToggle,
  onFetchMp4,
  onDownloadMp4,
  disabled,
}: {
  result: SourcifyResult;
  selected: boolean;
  onToggle: () => void;
  onFetchMp4: (result: SourcifyResult) => void;
  onDownloadMp4: (result: SourcifyResult) => void;
  disabled: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [hovered, setHovered] = useState(false);
  const hasMp4 = isDirectMediaUrl(result.mediaUrl);
  const hasMedia = Boolean(result.mediaUrl);
  const hasThumbnail = Boolean(result.thumbnailUrl);
  const sourceUrl = typeof result.sourceUrl === "string" ? result.sourceUrl : "";
  const youtubeEmbedUrl = !hasMp4 && result.platform === "youtube" ? youtubeHoverEmbedUrl(sourceUrl) : undefined;
  const canHoverPreview = hasMp4 || Boolean(youtubeEmbedUrl);
  const canFetchMp4 = !hasMp4 && canRequestMp4(result);
  const isMetadataOnly = !hasMedia && !canFetchMp4;

  const handleMouseEnter = () => {
    if (!canHoverPreview) return;
    setHovered(true);
    if (!videoRef.current) return;
    try {
      // Muted playback should be allowed on hover without a click on most platforms.
      videoRef.current.currentTime = 0;
      void videoRef.current.play();
    } catch {
      // ignore
    }
  };

  const handleMouseLeave = () => {
    if (!canHoverPreview) return;
    setHovered(false);
    if (!videoRef.current) return;
    try {
      videoRef.current.pause();
      videoRef.current.currentTime = 0;
    } catch {
      // ignore
    }
  };

  return (
    <Card
      className={cn(
        "overflow-hidden rounded-lg border-white/10 bg-[#111318] transition-colors hover:border-white/20",
        selected && "border-orange-400/40 ring-1 ring-orange-400/30",
      )}
    >
      <div
        className={cn("group relative aspect-video bg-black/40", canHoverPreview && "cursor-pointer")}
        onMouseEnter={canHoverPreview ? handleMouseEnter : undefined}
        onMouseLeave={canHoverPreview ? handleMouseLeave : undefined}
      >
        {hasThumbnail ? (
          <img
            src={result.thumbnailUrl}
            alt=""
            className={cn("h-full w-full object-cover", canHoverPreview && "transition-opacity group-hover:opacity-0")}
            loading="lazy"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-zinc-600">
            <DatabaseZap className="h-8 w-8" />
          </div>
        )}

        {hasMp4 && (
          <video
            ref={videoRef}
            src={result.mediaUrl}
            className="absolute inset-0 h-full w-full object-cover opacity-0 transition-opacity group-hover:opacity-100"
            muted
            loop
            playsInline
            preload="metadata"
            poster={result.thumbnailUrl}
          />
        )}
        {youtubeEmbedUrl && hovered && (
          <iframe
            src={youtubeEmbedUrl}
            title="YouTube preview"
            className="pointer-events-none absolute inset-0 h-full w-full border-0 opacity-0 transition-opacity group-hover:opacity-100"
            allow="autoplay; encrypted-media; picture-in-picture"
            referrerPolicy="no-referrer"
          />
        )}


        {canHoverPreview && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/60 to-transparent px-3 py-2">
            <span className="text-[11px] font-semibold text-zinc-100">Hover to preview</span>
            <Badge
              variant="secondary"
              className={cn(
                "text-[10px] uppercase",
                hasMp4 ? "border-emerald-300/20 bg-emerald-400/10 text-emerald-200" : "border-sky-300/20 bg-sky-400/10 text-sky-100",
              )}
            >
              {hasMp4 ? "mp4" : "preview"}
            </Badge>
          </div>
        )}
      </div>

      <div className="space-y-3 p-3">
        <div className="flex items-start gap-3">
          <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Select ${result.title}`} />
          <div className="min-w-0 flex-1">
            <h3 className="line-clamp-2 text-sm font-semibold text-zinc-100">{result.title}</h3>
            <p className="mt-1 truncate text-xs text-zinc-400">{result.creator ?? result.platform}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className="border-white/10 bg-white/5 text-[10px] uppercase text-zinc-300">
            {result.category}
          </Badge>
          <Badge variant="secondary" className="border-white/10 bg-white/5 text-[10px] uppercase text-zinc-300">
            {result.platform}
          </Badge>
          <Badge
            variant="secondary"
            className={cn(
              "border-white/10 text-[10px] uppercase",
              result.downloadable ? "bg-emerald-500/10 text-emerald-200" : "bg-amber-500/10 text-amber-200",
            )}
          >
            {result.downloadable ? "downloadable" : "metadata"}
          </Badge>
          {result.actorKey && (
            <Badge variant="secondary" className="border-white/10 bg-white/5 text-[10px] uppercase text-zinc-300">
              {result.actorKey}
            </Badge>
          )}
          {result.finalized && (
            <Badge variant="secondary" className="border-emerald-300/20 bg-emerald-400/10 text-[10px] uppercase text-emerald-200">
              finalized
            </Badge>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {canFetchMp4 ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
              disabled={disabled}
              onClick={() => onFetchMp4(result)}
            >
              Fetch MP4
            </Button>
          ) : null}
          {hasMedia ? (
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
              disabled={disabled}
              onClick={() => onDownloadMp4(result)}
            >
              <Download className="mr-1.5 h-3.5 w-3.5" />
              Download MP4
            </Button>
          ) : null}
        </div>

        {isMetadataOnly && (
          <p className="rounded-md border border-amber-300/15 bg-amber-400/5 px-2 py-1.5 text-[11px] leading-4 text-amber-200/90">
            Metadata only — no downloadable video was detected for this result.
          </p>
        )}

        <div className="grid grid-cols-4 gap-2 text-[11px] text-zinc-500">
          <span>{metric(result.metrics.views)} views</span>
          <span>{metric(result.metrics.likes)} likes</span>
          <span>{metric(result.metrics.comments)} comments</span>
          <span>{metric(result.metrics.shares)} shares</span>
        </div>

        {(result.datasetId || result.runId) && (
          <div className="text-[11px] text-zinc-500">
            {result.datasetId ? `dataset ${result.datasetId.slice(0, 10)}…` : null}
            {result.datasetId && result.runId ? " · " : null}
            {result.runId ? `run ${result.runId.slice(0, 10)}…` : null}
          </div>
        )}

        {result.sourceUrl && (
          <a
            href={result.sourceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs text-orange-200 hover:text-orange-100"
          >
            Open source <ExternalLink className="h-3 w-3" />
          </a>
        )}
      </div>
    </Card>
  );
}

export default function Sourcify() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { isCollapsed } = useSidebar();
  const [topic, setTopic] = useState("cinematic creator clips");
  const [settings, setSettings] = useState<SourcifySettings>(DEFAULT_SOURCIFY_SETTINGS);
  const [plan, setPlan] = useState<SourcifyPlan | null>(null);
  const [selectedActorIds, setSelectedActorIds] = useState<Set<string>>(new Set());
  const [results, setResults] = useState<SourcifyResult[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [platformFilter, setPlatformFilter] = useState<PlatformFilter>("all");
  const [busy, setBusy] = useState<BusyState>("idle");
  const [error, setError] = useState<string | null>(null);

  const plannedTargets = useMemo(() => {
    if (!plan) return [];
    if (plan.targets && plan.targets.length > 0) return plan.targets;
    return [
      {
        id: "target-default",
        label: plan.topic,
        query: plan.topic,
        rationale: plan.assistantMessage ?? "Sourcify built this source plan from your prompt.",
        actors: plan.actors,
      },
    ];
  }, [plan]);
  const plannedActors = useMemo(() => plannedTargets.flatMap((target) => target.actors), [plannedTargets]);
  const selectedActors = useMemo(
    () => plannedActors.filter((actor) => selectedActorIds.has(actor.id) && actor.configured),
    [plannedActors, selectedActorIds],
  );
  const filteredResults = useMemo(() => {
    if (platformFilter === "all") return results;
    return results.filter((result) => result.platform === platformFilter);
  }, [results, platformFilter]);

  const resultsByPlatform = useMemo(() => {
    return filteredResults.reduce<Record<string, SourcifyResult[]>>(
      (groups, result) => {
        const key = result.platform === "unknown" ? "unknown" : result.platform;
        (groups[key] ??= []).push(result);
        return groups;
      },
      {
        youtube: [],
        tiktok: [],
        instagram: [],
        twitch: [],
        unknown: [],
      },
    );
  }, [filteredResults]);

  const selectedResults = useMemo(
    () => results.filter((result) => selectedIds.has(result.id)),
    [results, selectedIds],
  );
  const downloadableSelection = selectedResults.filter((result) => Boolean(result.mediaUrl));
  const needsDownloadSelection = selectedResults.filter(
    (result) => !isDirectMediaUrl(result.mediaUrl) && canRequestMp4(result),
  );

  const filteredIds = useMemo(() => filteredResults.map((result) => result.id), [filteredResults]);
  const allFilteredSelected = useMemo(
    () => filteredIds.length > 0 && filteredIds.every((id) => selectedIds.has(id)),
    [filteredIds, selectedIds],
  );

  const handleHomeViewChange = useCallback((view: string) => {
    navigate(appRoutes.home, { state: { activeView: view } });
  }, [navigate]);

  const handleCreateProject = useCallback(() => {
    navigate(appRoutes.projectSetup);
  }, [navigate]);

  const updateSetting = (key: keyof SourcifySettings, value: number | boolean) => {
    setSettings((current) => ({ ...current, [key]: value }));
  };

  const handlePlan = async () => {
    if (!topic.trim()) {
      setError("Enter a topic, person, or keyword.");
      return;
    }

    setBusy("planning");
    setError(null);
    try {
      const nextPlan = await planSourcifyTopic(topic, settings);
      setPlan(nextPlan);
      setSelectedActorIds(new Set(nextPlan.actors.filter((actor) => actor.configured).map((actor) => actor.id)));
      toast.success("Sourcify plan ready");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not plan sources.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy("idle");
    }
  };

  const handleRun = async () => {
    if (selectedActors.length === 0) {
      setError("Select at least one configured actor to run.");
      return;
    }

    setBusy("running");
    setError(null);
    try {
      const responses: SourcifyRunResponse[] = [];
      for (const actor of selectedActors) {
        responses.push(
          await runSourcifyActor({
            topic: actor.query,
            actorKey: actor.key,
            actorInput: actor.input,
            settings,
          }),
        );
      }
      const nextResults = responses.flatMap((response) => response.results);
      setResults((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        for (const result of nextResults) byId.set(result.id, result);
        return Array.from(byId.values());
      });
      toast.success(nextResults.length ? "Scrape results loaded" : "Scrapes finished with no results");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not run the selected actors.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy("idle");
    }
  };

  const toggleActor = (actor: SourcifyActorPlan) => {
    if (!actor.configured) {
      setError(actor.notes?.[0] ?? `${actor.label} is not available for this input.`);
      return;
    }
    setError(null);
    setSelectedActorIds((current) => {
      const next = new Set(current);
      if (next.has(actor.id)) next.delete(actor.id);
      else next.add(actor.id);
      return next;
    });
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownloadMp4 = (result: SourcifyResult) => {
    if (!result.mediaUrl) return;
    downloadSourcifyResults([result]);
  };

  const handleFetchMp4 = async (requested?: SourcifyResult[]) => {
    if (busy !== "idle") return;
    const selection = (requested ?? selectedResults).filter(Boolean);
    if (selection.length === 0) return;

    const needsDownload = selection.filter((result) => !isDirectMediaUrl(result.mediaUrl) && canRequestMp4(result));
    if (needsDownload.length === 0) {
      toast("Selection already includes downloadable media.");
      return;
    }

    const MAX_DOWNLOADS = 12;
    const candidates = needsDownload.slice(0, MAX_DOWNLOADS);
    if (needsDownload.length > MAX_DOWNLOADS) {
      toast.warning(`Only downloading the first ${MAX_DOWNLOADS} selections to control Apify cost/time.`);
    }

    const youtubeUrls = candidates
      .filter((result) => result.platform === "youtube" && canRequestMp4(result))
      .map((result) => result.sourceUrl as string);

    const instagramUrls = candidates
      .filter((result) => result.platform === "instagram" && canRequestMp4(result))
      .map((result) => result.sourceUrl as string);


    const tiktokUrls = candidates
      .filter((result) => result.platform === "tiktok" && typeof result.sourceUrl === "string" && isTikTokVideoUrl(result.sourceUrl))
      .map((result) => result.sourceUrl as string);

    if (youtubeUrls.length === 0 && instagramUrls.length === 0 && tiktokUrls.length === 0) {
      toast.error(
        "No supported video URLs selected (YouTube watch/shorts, Instagram Reels, or TikTok videos). Select results with video URLs first.",
      );
      return;
    }

    setBusy("downloading");
    setError(null);
    try {
      const downloadSettings: SourcifySettings = {
        ...settings,
        includeDownloadableOnly: true,
        waitForFinishSecs: Math.min(60, Math.max(settings.waitForFinishSecs, 60)),
        maxItems: Math.min(1000, Math.max(settings.maxItems, youtubeUrls.length + instagramUrls.length + tiktokUrls.length)),
      };

      const downloaded: SourcifyResult[] = [];
      if (youtubeUrls.length > 0) {
        const response = await runSourcifyActor({
          topic: `${topic} (mp4)`,
          actorKey: "youtube-downloader",
          actorInput: {
            startUrls: youtubeUrls,
            quality: "720",
            includeFailedVideos: false,
            proxy: { useApifyProxy: true },
          },
          settings: downloadSettings,
        });
        downloaded.push(...response.results);
      }

      if (instagramUrls.length > 0) {
        const response = await runSourcifyActor({
          topic: `${topic} (mp4)`,
          actorKey: "instagram-reels",
          actorInput: {
            links: instagramUrls,
            proxyConfiguration: {
              useApifyProxy: false,
              apifyProxyGroups: ["RESIDENTIAL"],
            },
          },
          settings: downloadSettings,
        });
        downloaded.push(...response.results);
      }


      if (tiktokUrls.length > 0) {
        const response = await runSourcifyActor({
          topic: `${topic} (mp4)`,
          actorKey: "tiktok-fast",
          actorInput: {
            postURLs: tiktokUrls,
            resultsPerPage: Math.min(50, Math.max(1, tiktokUrls.length)),
            profileScrapeSections: ["videos"],
            profileSorting: "latest",
            excludePinnedPosts: false,
            maxFollowersPerProfile: 0,
            maxFollowingPerProfile: 0,
            maxProfilesPerQuery: 10,
            videoSearchSorting: "MOST_RELEVANT",
            videoSearchDateFilter: "ALL_TIME",
            scrapeRelatedVideos: false,
            shouldDownloadVideos: true,
            shouldDownloadCovers: false,
            shouldDownloadSlideshowImages: false,
            shouldDownloadAvatars: false,
            shouldDownloadMusicCovers: false,
            downloadSubtitlesOptions: "NEVER_DOWNLOAD_SUBTITLES",
            commentsPerPost: 0,
            topLevelCommentsPerPost: 0,
            maxRepliesPerComment: 0,
            proxyCountryCode: "None",
          },
          settings: downloadSettings,
        });
        downloaded.push(...response.results);
      }
      const bySourceUrl = new Map<string, SourcifyResult>();
      for (const item of downloaded) {
        if (item.sourceUrl && item.mediaUrl) bySourceUrl.set(item.sourceUrl, item);
      }

      let updatedCount = 0;
      setResults((current) => {
        const existingSourceUrls = new Set(current.map((item) => item.sourceUrl).filter(Boolean) as string[]);
        const next = current.map((item) => {
          const sourceUrl = item.sourceUrl ?? "";
          const replacement = sourceUrl ? bySourceUrl.get(sourceUrl) : undefined;
          if (!replacement?.mediaUrl) return item;
          updatedCount += 1;
          return {
            ...item,
            mediaUrl: replacement.mediaUrl,
            downloadable: true,
            runId: replacement.runId ?? item.runId,
            datasetId: replacement.datasetId ?? item.datasetId,
            actorId: replacement.actorId ?? item.actorId,
          };
        });

        for (const item of downloaded) {
          if (item.sourceUrl && item.mediaUrl && !existingSourceUrls.has(item.sourceUrl)) {
            next.push(item);
          }
        }
        return next;
      });

      toast.success(updatedCount > 0 ? `Downloaded MP4 links for ${updatedCount} result${updatedCount === 1 ? "" : "s"}` : "No MP4 links returned.");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not download MP4 media for the selection.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy("idle");
    }
  };


  const handleSave = async (assetCategory: "upload" | "finalized") => {
    if (selectedResults.length === 0) return;
    setBusy("saving");
    setError(null);
    try {
      const response = await finalizeSourcifyResults({
        assetCategory,
        results: selectedResults,
      });
      const savedIds = new Set(response.assets.map((asset) => asset.resultId));
      setResults((current) =>
        current.map((result) => (savedIds.has(result.id) ? { ...result, finalized: assetCategory === "finalized" } : result)),
      );
      toast.success(assetCategory === "finalized" ? "Finalized selected assets" : "Added selected assets");
      if (response.skipped.length > 0) {
        toast.warning(`${response.skipped.length} result${response.skipped.length === 1 ? "" : "s"} could not be saved`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not save selected results.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy("idle");
    }
  };

  return (
    <div className="min-h-screen bg-[#08090d] text-zinc-100">
      <div className="hidden md:block">
        <Sidebar activeView="sourcify" onViewChange={handleHomeViewChange} />
      </div>

      <motion.main
        className="min-h-screen pb-24 md:pb-8"
        animate={{ marginLeft: isMobile ? 0 : isCollapsed ? 64 : 256 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        initial={false}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-6">
          <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <DatabaseZap className="h-5 w-5 text-orange-300" />
                <Badge variant="secondary" className="border-orange-300/20 bg-orange-400/10 text-orange-100">
                  Apify
                </Badge>
                <Badge variant="secondary" className="border-sky-300/20 bg-sky-400/10 text-sky-100">
                  Codex planner
                </Badge>
              </div>
              <h1 className="text-2xl font-semibold tracking-normal text-white md:text-3xl">Sourcify</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="secondary"
                className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                disabled={selectedResults.length === 0 || busy !== "idle"}
                onClick={() => handleSave("upload")}
              >
                <Plus className="mr-2 h-4 w-4" />
                Add to library
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                disabled={selectedResults.length === 0 || needsDownloadSelection.length === 0 || busy !== "idle"}
                onClick={() => void handleFetchMp4()}
              >
                {busy === "downloading" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Fetch MP4s
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                disabled={downloadableSelection.length === 0 || busy !== "idle"}
                onClick={() => downloadSourcifyResults(downloadableSelection)}
              >
                <Download className="mr-2 h-4 w-4" />
                Download MP4s
              </Button>
              <Button
                type="button"
                className="bg-orange-500 text-white hover:bg-orange-400"
                disabled={selectedResults.length === 0 || busy !== "idle"}
                onClick={() => handleSave("finalized")}
              >
                {busy === "saving" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                Finalize
              </Button>
            </div>
          </header>

          <section className="grid gap-4 lg:grid-cols-[1.4fr_0.9fr]">
            <div className="space-y-4">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-100">
                  <Sparkles className="h-4 w-4 text-sky-200" />
                  Codex source query
                </div>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                  <div className="relative flex-1">
                    <Search className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-zinc-500" />
                    <Textarea
                      value={topic}
                      onChange={(event) => setTopic(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) void handlePlan();
                      }}
                      className="min-h-[104px] resize-none border-white/10 bg-black/30 pl-10 text-zinc-100 placeholder:text-zinc-600"
                      placeholder="Ask for sources by keyword, platform, creator, hashtag, URL, or natural language prompt"
                      aria-label="Sourcify Codex prompt"
                    />
                  </div>
                  <Button type="button" className="h-11 bg-orange-500 text-white hover:bg-orange-400" onClick={handlePlan} disabled={busy !== "idle"}>
                    {busy === "planning" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Settings2 className="mr-2 h-4 w-4" />}
                    Plan sources
                  </Button>
                </div>
                {plan?.assistantMessage && (
                  <div className="mt-3 rounded-lg border border-sky-300/15 bg-sky-400/10 px-3 py-2 text-xs leading-5 text-sky-100">
                    {plan.assistantMessage}
                  </div>
                )}
              </div>

              {error && (
                <div className="flex items-center gap-2 rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Label className="space-y-2 text-xs text-zinc-400">
                  <span>Max items</span>
                  <Input
                    type="number"
                    min={1}
                    max={1000}
                    value={settings.maxItems}
                    onChange={(event) => updateSetting("maxItems", Number(event.target.value))}
                    className="border-white/10 bg-black/30 text-zinc-100"
                  />
                </Label>
                <Label className="space-y-2 text-xs text-zinc-400">
                  <span>Max charge</span>
                  <Input
                    type="number"
                    min={0}
                    step={0.5}
                    value={settings.maxTotalChargeUsd}
                    onChange={(event) => updateSetting("maxTotalChargeUsd", Number(event.target.value))}
                    className="border-white/10 bg-black/30 text-zinc-100"
                  />
                </Label>
                <Label className="space-y-2 text-xs text-zinc-400">
                  <span>Wait seconds</span>
                  <Input
                    type="number"
                    min={0}
                    max={60}
                    value={settings.waitForFinishSecs}
                    onChange={(event) => updateSetting("waitForFinishSecs", Number(event.target.value))}
                    className="border-white/10 bg-black/30 text-zinc-100"
                  />
                </Label>
                <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-xs text-zinc-300">
                  <Checkbox
                    checked={settings.includeDownloadableOnly}
                    onCheckedChange={(checked) => updateSetting("includeDownloadableOnly", checked === true)}
                  />
                  Downloadable only
                </label>
              </div>
            </div>

            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-zinc-100">Actors</h2>
                {plan && <span className="text-xs text-zinc-500">{selectedActors.length}/{plannedActors.length} selected</span>}
              </div>
              <div className="space-y-3">
                {plannedTargets.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 p-5 text-sm text-zinc-500">
                    No actor plan yet.
                  </div>
                ) : (
                  plannedTargets.map((target) => (
                    <div key={target.id} className="space-y-2 rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate text-sm font-semibold text-zinc-100">{target.label}</span>
                          <Badge variant="secondary" className="border-white/10 bg-white/5 text-[10px] uppercase text-zinc-300">
                            {target.actors.length} actors
                          </Badge>
                        </div>
                        <p className="mt-1 line-clamp-2 text-xs text-zinc-500">{target.rationale}</p>
                      </div>
                      {target.actors.map((actor) => (
                        <ActorButton
                          key={actor.id}
                          actor={actor}
                          selected={selectedActorIds.has(actor.id)}
                          onToggle={() => toggleActor(actor)}
                        />
                      ))}
                    </div>
                  ))
                )}
              </div>
              <Separator className="my-4 bg-white/10" />
              <Button
                type="button"
                className="w-full bg-zinc-100 text-zinc-950 hover:bg-white"
                disabled={selectedActors.length === 0 || busy !== "idle"}
                onClick={handleRun}
              >
                {busy === "running" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                Run selected scrapes
              </Button>
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-white">Results</h2>
                <p className="text-sm text-zinc-500">
                  {filteredResults.length} result{filteredResults.length === 1 ? "" : "s"}
                  {platformFilter === "all" ? "" : ` (filtered from ${results.length})`}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {(["all", "youtube", "tiktok", "instagram", "twitch"] as PlatformFilter[]).map((filter) => (
                  <Button
                    key={filter}
                    type="button"
                    size="sm"
                    variant="secondary"
                    className={cn(
                      "border-white/10 bg-white/5 text-zinc-200 hover:bg-white/10",
                      platformFilter === filter && "border-orange-400/40 bg-orange-500/10 text-orange-100",
                    )}
                    onClick={() => setPlatformFilter(filter)}
                  >
                    {filter}
                  </Button>
                ))}
                {filteredResults.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="text-zinc-300 hover:bg-white/5 hover:text-white"
                    onClick={() =>
                      setSelectedIds((current) => {
                        const next = new Set(current);
                        if (allFilteredSelected) {
                          for (const id of filteredIds) next.delete(id);
                        } else {
                          for (const id of filteredIds) next.add(id);
                        }
                        return next;
                      })
                    }
                  >
                    {allFilteredSelected ? "Clear selection" : "Select all"}
                  </Button>
                )}
              </div>
            </div>

            {filteredResults.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 p-10 text-center text-sm text-zinc-500">
                {platformFilter === "all" ? "Scrape results will appear here." : `No results for ${platformFilter}.`}
              </div>
            ) : (
              Object.entries(resultsByPlatform).map(([platform, platformResults]) => {
                if (platformResults.length === 0) return null;
                const grouped = groupSourcifyResults(platformResults);

                return (
                  <div key={platform} className="space-y-4">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-zinc-500">{platform}</h3>
                      <Badge
                        variant="secondary"
                        className="border-white/10 bg-white/5 text-[10px] uppercase text-zinc-300"
                      >
                        {platformResults.length}
                      </Badge>
                    </div>
                    {Object.entries(grouped).map(([category, categoryResults]) =>
                      categoryResults.length > 0 ? (
                        <div key={`${platform}-${category}`} className="space-y-3">
                          <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-600">
                            {categoryLabels[category as SourcifyResult["category"]]}
                          </h4>
                          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                            {categoryResults.map((result) => (
                              <ResultCard
                                key={result.id}
                                result={result}
                                selected={selectedIds.has(result.id)}
                                onToggle={() => toggleSelection(result.id)}
                                onFetchMp4={(item) => void handleFetchMp4([item])}
                                onDownloadMp4={handleDownloadMp4}
                                disabled={busy !== "idle"}
                              />
                            ))}
                          </div>
                        </div>
                      ) : null,
                    )}
                  </div>
                );
              })
            )}
          </section>
        </div>
      </motion.main>

      <MobileBottomNav
        activeView="sourcify"
        onViewChange={handleHomeViewChange}
        onCreateProject={handleCreateProject}
      />
    </div>
  );
}
