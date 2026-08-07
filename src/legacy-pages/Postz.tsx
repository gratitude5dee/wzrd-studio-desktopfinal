import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { CalendarDays, ChevronLeft, ChevronRight, Loader2, Plus } from "lucide-react";
import { endOfMonth, endOfWeek, startOfMonth, startOfWeek } from "date-fns";
import { toast } from "sonner";

import { MobileBottomNav } from "@/components/home/MobileBottomNav";
import { Sidebar } from "@/components/home/Sidebar";
import { ChannelRail } from "@/components/postz/ChannelRail";
import { AddChannelDialog } from "@/components/postz/AddChannelDialog";
import { CompleteChannelDialog } from "@/components/postz/CompleteChannelDialog";
import { PostComposer } from "@/components/postz/PostComposer";
import { PostzCalendar } from "@/components/postz/PostzCalendar";
import { StatePills, POSTZ_STATE_FILTER_ALL } from "@/components/postz/StatePills";
import type { PostzStateFilter } from "@/components/postz/StatePills";
import type { PostzMediaRef, PostzPostState } from "@/types/postz";
import type { ProjectAsset } from "@/types/assets";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useSidebar } from "@/contexts/SidebarContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAssets } from "@/hooks/useAssets";
import {
  POSTZ_QUERY_KEYS,
  usePostzChannels,
  usePostzGroup,
  usePostzPostsWindow,
  useReschedulePostzGroup,
  useSeedPostzChannels,
} from "@/hooks/usePostz";
import { appRoutes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { providerLabel } from "@/components/postz/postzMeta";

function monthLabel(date: Date) {
  return new Intl.DateTimeFormat(undefined, { month: "long", year: "numeric" }).format(date);
}

function roundToNextQuarterHour(date: Date) {
  const d = new Date(date);
  d.setSeconds(0);
  d.setMilliseconds(0);
  const minutes = d.getMinutes();
  const rounded = Math.ceil(minutes / 15) * 15;
  if (rounded === 60) {
    d.setHours(d.getHours() + 1);
    d.setMinutes(0);
  } else {
    d.setMinutes(rounded);
  }
  return d;
}
function toMediaRef(asset: ProjectAsset): PostzMediaRef {
  const metadata = (asset.media_metadata ?? {}) as Record<string, unknown>;
  return {
    asset_id: asset.id,
    cdn_url: asset.cdn_url ?? undefined,
    mime_type: asset.mime_type ?? undefined,
    kind: asset.asset_type === "video" ? "video" : asset.asset_type === "image" ? "image" : undefined,
    width: typeof metadata.width === "number" ? metadata.width : undefined,
    height: typeof metadata.height === "number" ? metadata.height : undefined,
    duration_seconds: typeof metadata.duration_seconds === "number" ? metadata.duration_seconds : undefined,
    size_bytes: asset.file_size_bytes ?? undefined,
  };
}


export default function Postz() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const isMobile = useIsMobile();
  const { isCollapsed } = useSidebar();

  const [anchor, setAnchor] = useState(() => startOfMonth(new Date()));
  const [stateFilter, setStateFilter] = useState(POSTZ_STATE_FILTER_ALL as PostzStateFilter);
  const stateParam = stateFilter === POSTZ_STATE_FILTER_ALL ? null : (stateFilter as PostzPostState);

  const [pendingConnection, setPendingConnection] = useState<null | { provider: string; stateId: string }>(null);
  const [completeConnectionOpen, setCompleteConnectionOpen] = useState(false);

  const stripConnectedParams = useCallback(() => {
    const params = new URLSearchParams(location.search);
    params.delete("connected");
    params.delete("provider");
    params.delete("channel");
    params.delete("status");
    params.delete("state_id");

    const nextSearch = params.toString();
    navigate({ pathname: location.pathname, search: nextSearch ? `?${nextSearch}` : "" }, { replace: true });
  }, [location.pathname, location.search, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("connected") !== "1") return;

    const status = (params.get("status") ?? "success").toLowerCase();
    const provider = params.get("provider");
    const stateId = params.get("state_id");

    if (status === "needs_target") {
      if (provider && stateId) {
        setPendingConnection({ provider, stateId });
        setCompleteConnectionOpen(true);
        toast.info("Finish connecting your channel", {
          description: "Select which profile/page/channel you want to connect.",
        });
      } else {
        toast.error("Invalid connection link", { description: "Missing provider or state." });
        stripConnectedParams();
      }
      return;
    }

    if (status === "success") {
      queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.channels() });
      toast.success("Channel connected");
    }

    if (status === "error") {
      toast.error("Channel connection failed");
    }

    stripConnectedParams();
  }, [location.search, queryClient, stripConnectedParams]);

  const [composerMedia, setComposerMedia] = useState([] as PostzMediaRef[]);

  const [addChannelOpen, setAddChannelOpen] = useState(false);

  const windowFrom = useMemo(() => startOfWeek(startOfMonth(anchor), { weekStartsOn: 0 }), [anchor]);
  const windowTo = useMemo(() => endOfWeek(endOfMonth(anchor), { weekStartsOn: 0 }), [anchor]);

  const channelsQuery = usePostzChannels();
  const seedChannels = useSeedPostzChannels();

  const allPostsQuery = usePostzPostsWindow({ from: windowFrom.toISOString(), to: windowTo.toISOString(), state: null });
  const postsQuery = usePostzPostsWindow({ from: windowFrom.toISOString(), to: windowTo.toISOString(), state: stateParam });
  const stateCounts = useMemo(() => {
    const posts = allPostsQuery.data ?? [];
    const groupState: Map<string, PostzPostState> = new Map();
    for (const post of posts) {
      if (!groupState.has(post.group_id)) groupState.set(post.group_id, post.state);
    }
    const counts: Partial<Record<PostzPostState, number>> = {};
    for (const state of groupState.values()) {
      counts[state] = (counts[state] ?? 0) + 1;
    }
    return counts;
  }, [allPostsQuery.data]);


  const reschedule = useReschedulePostzGroup();

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerDate, setComposerDate] = useState(() => roundToNextQuarterHour(new Date()));
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);

  const groupQuery = usePostzGroup(editingGroupId);

  const { data: finalizedAssets, isLoading: finalizedLoading } = useAssets({
    assetCategory: ["finalized"],
    assetType: ["video"],
    limit: 50,
    sortBy: "created_at",
    sortOrder: "desc",
  });

  const handleHomeViewChange = useCallback(
    (view: string) => {
      navigate(appRoutes.home, { state: { activeView: view } });
    },
    [navigate],
  );

  const handleCreateProject = useCallback(() => {
    navigate(appRoutes.projectSetup);
  }, [navigate]);

  const shiftMonth = (amount: number) => {
    setAnchor((current) => startOfMonth(new Date(current.getFullYear(), current.getMonth() + amount, 1)));
  };

  const openNewComposer = (date: Date, media?: PostzMediaRef[]) => {
    setEditingGroupId(null);
    setComposerMedia(media ?? []);
    setComposerDate(date);
    setComposerOpen(true);
  };

  const openEditComposer = (groupId: string) => {
    setEditingGroupId(groupId);
    setComposerMedia([]);
    setComposerDate(roundToNextQuarterHour(new Date()));
    setComposerOpen(true);
  };

  const handleMoveGroup = (groupId: string, targetDay: Date) => {
    const posts = postsQuery.data ?? [];
    const first = posts.find((post) => post.group_id === groupId);
    if (!first) return;

    const currentDate = new Date(first.publish_date);
    const next = new Date(targetDay);
    next.setHours(currentDate.getHours(), currentDate.getMinutes(), 0, 0);

    reschedule.mutate({ group_id: groupId, publish_date: next.toISOString() });
  };

  const channels = channelsQuery.data ?? [];

  return (
    <div className="min-h-screen bg-[#08090d] text-zinc-100">
      <div className="hidden md:block">
        <Sidebar activeView="postz" onViewChange={handleHomeViewChange} />
      </div>

      <motion.main
        className="min-h-screen pb-24 md:pb-8"
        animate={{ marginLeft: isMobile ? 0 : isCollapsed ? 64 : 256 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        initial={false}
      >
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 md:px-6">
          <header className="flex flex-col gap-4 border-b border-white/10 pb-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="min-w-0">
              <div className="mb-2 flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-orange-300" />
                <Badge variant="secondary" className="border-orange-300/20 bg-orange-400/10 text-orange-100">
                  Postiz
                </Badge>
              </div>
              <h1 className="text-2xl font-semibold tracking-normal text-white md:text-3xl">Postz</h1>
              <p className="mt-1 text-sm text-zinc-500">Schedule multi-channel posts (Phase 3: real channels + OAuth).</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className="bg-orange-500 text-white hover:bg-orange-500/90"
                onClick={() => openNewComposer(roundToNextQuarterHour(new Date()))}
              >
                <Plus className="mr-2 h-4 w-4" />
                New post
              </Button>

              <Button
                type="button"
                variant="secondary"
                className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-40 text-center text-sm font-semibold text-zinc-200">{monthLabel(anchor)}</div>
              <Button
                type="button"
                variant="secondary"
                className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </header>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">Filter by state</div>
              <div className="mt-2">
                <StatePills value={stateFilter} onChange={setStateFilter} counts={stateCounts} />
              </div>
            </div>
            {stateParam && (
              <Button
                type="button"
                variant="secondary"
                className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                onClick={() => setStateFilter(POSTZ_STATE_FILTER_ALL)}
              >
                Clear filter
              </Button>
            )}
          </div>


          {pendingConnection && (
            <Card className="rounded-lg border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-amber-100">
                    Finish connecting {providerLabel(pendingConnection.provider)}
                  </div>
                  <div className="mt-1 text-xs text-amber-200/80">Select which profile/page/channel you want to connect.</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="bg-orange-500 text-white hover:bg-orange-500/90"
                    onClick={() => setCompleteConnectionOpen(true)}
                  >
                    Continue
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                    onClick={() => {
                      setPendingConnection(null);
                      stripConnectedParams();
                    }}
                  >
                    Dismiss
                  </Button>
                </div>
              </div>
            </Card>
          )}

          <section className="grid gap-5 xl:grid-cols-[1fr_340px]">
            <div className="space-y-4">
              {postsQuery.isLoading ? (
                <div className="flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] py-16 text-zinc-500">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : postsQuery.isError ? (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-5 text-sm text-red-200">
                  Unable to load posts.
                </div>
              ) : (
                <PostzCalendar
                  anchor={anchor}
                  posts={postsQuery.data ?? []}
                  channels={channels}
                  onCreateAt={(day) => {
                    const d = new Date(day);
                    const now = new Date();
                    if (d.toDateString() === now.toDateString()) {
                      openNewComposer(roundToNextQuarterHour(now));
                      return;
                    }
                    d.setHours(9, 0, 0, 0);
                    openNewComposer(d);
                  }}
                  onEditGroup={openEditComposer}
                  onMoveGroup={handleMoveGroup}
                />
              )}

              {postsQuery.data && postsQuery.data.length === 0 && (
                <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-5 text-sm text-zinc-500">
                  {stateParam
                    ? `No ${stateParam.toLowerCase()} posts in this window. Switch the filter to “All” to see everything.`
                    : "No posts scheduled for this month. Click a day (or “New post”) to create one."}
                </div>
              )}
            </div>

            <aside className="space-y-4">
              <ChannelRail
                channels={channels}
                isLoading={channelsQuery.isLoading}
                onSeedDemo={() => seedChannels.mutate()}
                seedLoading={seedChannels.isPending}
                onAddChannel={() => setAddChannelOpen(true)}
              />

              <Card className="rounded-lg border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-zinc-100">Finalized assets</h2>
                  <Badge variant="secondary" className="border-white/10 bg-white/5 text-zinc-300">
                    {(finalizedAssets ?? []).length}
                  </Badge>
                </div>

                {finalizedLoading ? (
                  <div className="flex items-center justify-center py-8 text-zinc-500">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                ) : finalizedAssets && finalizedAssets.length > 0 ? (
                  <div className="space-y-2">
                    {finalizedAssets.slice(0, 8).map((asset) => (
                      <div
                        key={asset.id}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-black/20 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="truncate text-sm text-zinc-200">{asset.original_file_name}</div>
                          <div className="text-xs text-zinc-500">
                            {asset.file_size_bytes ? `${Math.round(asset.file_size_bytes / 1024 / 1024)} MB` : ""}
                          </div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                          onClick={() => openNewComposer(roundToNextQuarterHour(new Date()), [toMediaRef(asset)])}
                        >
                          Use
                        </Button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-lg border border-dashed border-white/10 p-5 text-sm text-zinc-500">
                    Finalized Sourcify assets will appear here.
                  </div>
                )}
              </Card>

              {reschedule.isPending && (
                <div className={cn("rounded-lg border border-white/10 bg-white/[0.03] p-4 text-sm text-zinc-400")}>
                  Rescheduling…
                </div>
              )}
            </aside>
          </section>
        </div>
      </motion.main>

      <MobileBottomNav activeView="postz" onViewChange={handleHomeViewChange} onCreateProject={handleCreateProject} />

      <PostComposer
        open={composerOpen}
        onOpenChange={(open) => {
          setComposerOpen(open);
          if (!open) {
            setEditingGroupId(null);
            setComposerMedia([]);
          }
        }}
        channels={channels}
        assets={finalizedAssets ?? []}
        initialDate={composerDate}
        initialMedia={composerMedia}
        editingGroup={groupQuery.data ?? (editingGroupId ? null : undefined)}
      />

      <AddChannelDialog open={addChannelOpen} onOpenChange={setAddChannelOpen} />

      {pendingConnection && (
        <CompleteChannelDialog
          open={completeConnectionOpen}
          onOpenChange={setCompleteConnectionOpen}
          provider={pendingConnection.provider}
          stateId={pendingConnection.stateId}
          onCompleted={() => {
            queryClient.invalidateQueries({ queryKey: POSTZ_QUERY_KEYS.channels() });
            setPendingConnection(null);
            stripConnectedParams();
          }}
        />
      )}
    </div>
  );
}
