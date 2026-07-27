import { Loader2, Trash2, Wand2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

import type { ProjectAsset } from "@/types/assets";
import type { PostzChannel, PostzGroup, PostzMediaRef, PostzPerChannelValidation, PostzPostGroupCreateInput, PostzPostState } from "@/types/postz";
import { MediaPicker } from "@/components/postz/MediaPicker";
import { PostPreview } from "@/components/postz/PostPreview";
import { SchedulePopover } from "@/components/postz/SchedulePopover";
import { providerLabel } from "@/components/postz/postzMeta";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  useCreatePostzGroup,
  useDeletePostzGroup,
  useFindPostzSlot,
  usePostNowPostzGroup,
  useUpdatePostzGroup,
  useValidatePostzGroup,
} from "@/hooks/usePostz";

function mergeDateAndTime(date: Date, timeValue: string): Date {
  const [hh, mm] = timeValue.split(":").map((v) => Number(v));
  const next = new Date(date);
  if (!Number.isNaN(hh)) next.setHours(hh);
  if (!Number.isNaN(mm)) next.setMinutes(mm);
  next.setSeconds(0);
  next.setMilliseconds(0);
  return next;
}

type Overrides = Record<string, { content?: string; media?: PostzMediaRef[]; title?: string | null }>;

function buildGroupInput(params: {
  publishDate: Date;
  state: PostzPostState;
  channelIds: string[];
  channels: PostzChannel[];
  globalContent: string;
  globalMedia: PostzMediaRef[];
  globalTitle: string | null;
  overrides: Overrides;
}): PostzPostGroupCreateInput {
  const providerByChannel = new Map(params.channels.map((ch) => [ch.id, ch.provider]));

  return {
    publish_date: params.publishDate.toISOString(),
    state: params.state,
    channels: params.channelIds.map((channelId) => {
      const override = params.overrides[channelId] ?? {};
      return {
        channel_id: channelId,
        content: override.content ?? params.globalContent,
        media: override.media ?? params.globalMedia,
        title: override.title ?? params.globalTitle,
        settings: { __type: providerByChannel.get(channelId), provider: providerByChannel.get(channelId) },
      };
    }),
  };
}

function hasBlockingIssues(perChannel: PostzPerChannelValidation[]): boolean {
  return perChannel.some((row) => row.issues.some((issue) => issue.level === "error"));
}

export function PostComposer({
  open,
  onOpenChange,
  channels,
  assets,
  initialDate,
  initialMedia,
  editingGroup,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channels: PostzChannel[];
  assets: ProjectAsset[];
  initialDate: Date;
  initialMedia?: PostzMediaRef[];
  editingGroup?: PostzGroup | null;
}) {
  const createMutation = useCreatePostzGroup();
  const updateMutation = useUpdatePostzGroup();
  const deleteMutation = useDeletePostzGroup();
  const postNowMutation = usePostNowPostzGroup();
  const validateMutation = useValidatePostzGroup();
  const slotMutation = useFindPostzSlot();

  const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
  const [tab, setTab] = useState("global");
  const [state, setState] = useState<PostzPostState>("DRAFT");
  const [globalContent, setGlobalContent] = useState("");
  const [globalTitle, setGlobalTitle] = useState<string | null>(null);
  const [globalMedia, setGlobalMedia] = useState<PostzMediaRef[]>([]);
  const [overrides, setOverrides] = useState<Overrides>({});
  const [publishDate, setPublishDate] = useState<Date>(initialDate);
  const [timeValue, setTimeValue] = useState(() => {
    const now = new Date(initialDate);
    return `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  });
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [validation, setValidation] = useState<PostzPerChannelValidation[]>([]);

  const isEditing = Boolean(editingGroup?.group_id);

  useEffect(() => {
    if (!open) return;

    if (editingGroup?.posts?.length) {
      const posts = editingGroup.posts;
      const first = posts[0];
      setSelectedChannelIds(posts.map((post) => post.channel_id));
      setState(first.state);
      setGlobalContent(first.content ?? "");
      setGlobalTitle(first.title ?? null);
      setGlobalMedia(Array.isArray(first.media) ? first.media : []);
      const date = new Date(first.publish_date);
      setPublishDate(date);
      setTimeValue(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);

      const nextOverrides: Overrides = {};
      for (const post of posts) {
        const o: Overrides[string] = {};
        if (post.content !== first.content) o.content = post.content;
        if ((post.title ?? null) !== (first.title ?? null)) o.title = post.title ?? null;
        if (JSON.stringify(post.media ?? []) !== JSON.stringify(first.media ?? [])) o.media = Array.isArray(post.media) ? post.media : [];
        if (Object.keys(o).length > 0) nextOverrides[post.channel_id] = o;
      }
      setOverrides(nextOverrides);
      setTab("global");
      setValidation([]);
      return;
    }

    setSelectedChannelIds(channels.map((ch) => ch.id));
    setState("DRAFT");
    setGlobalContent("");
    setGlobalTitle(null);
    setGlobalMedia(initialMedia ?? []);
    setOverrides({});
    setPublishDate(initialDate);
    setTimeValue(`${String(initialDate.getHours()).padStart(2, "0")}:${String(initialDate.getMinutes()).padStart(2, "0")}`);
    setTab("global");
    setValidation([]);
  }, [open, channels, initialDate, initialMedia, editingGroup]);

  useEffect(() => {
    setOverrides((current) => {
      const next: Overrides = {};
      for (const channelId of selectedChannelIds) {
        if (current[channelId]) next[channelId] = current[channelId];
      }
      return next;
    });
  }, [selectedChannelIds]);

  const publishDateWithTime = useMemo(() => mergeDateAndTime(publishDate, timeValue), [publishDate, timeValue]);

  const assetsById = useMemo(() => new Map(assets.map((asset) => [asset.id, asset])), [assets]);

  const getContentForChannel = (channelId: string) => {
    const override = overrides[channelId] ?? {};
    return String(override.content ?? globalContent).trim();
  };

  const groupInput = useMemo(() => {
    return buildGroupInput({
      publishDate: publishDateWithTime,
      state,
      channelIds: selectedChannelIds,
      channels,
      globalContent,
      globalMedia,
      globalTitle,
      overrides,
    });
  }, [publishDateWithTime, state, selectedChannelIds, channels, globalContent, globalMedia, globalTitle, overrides]);

  const debouncedValidate = useDebouncedCallback(async (payload: PostzPostGroupCreateInput) => {
    try {
      const result = await validateMutation.mutateAsync(payload);
      setValidation(result.per_channel);
    } catch {
      // Ignore validation errors during typing.
    }
  }, 350);

  useEffect(() => {
    if (!open) return;
    if (selectedChannelIds.length === 0) return;
    debouncedValidate(groupInput);
  }, [open, selectedChannelIds, groupInput, debouncedValidate]);

  const perChannelValidation = useMemo(() => {
    const map = new Map<string, PostzPerChannelValidation>();
    for (const row of validation) map.set(row.channel_id, row);
    return map;
  }, [validation]);

  const handleSave = async () => {
    if (selectedChannelIds.length === 0) return;

    try {
      const result = await validateMutation.mutateAsync(groupInput);
      setValidation(result.per_channel);
      if (hasBlockingIssues(result.per_channel)) {
        return;
      }

      if (isEditing && editingGroup?.group_id) {
        await updateMutation.mutateAsync({ group_id: editingGroup.group_id, group: groupInput });
      } else {
        await createMutation.mutateAsync(groupInput);
      }

      onOpenChange(false);
    } catch {
      // mutation hooks toast errors.
    }
  };

  const handleDelete = async () => {
    if (!editingGroup?.group_id) return;
    await deleteMutation.mutateAsync(editingGroup.group_id);
    onOpenChange(false);
  };

  const handlePostNow = async () => {
    if (!editingGroup?.group_id) return;
    await postNowMutation.mutateAsync(editingGroup.group_id);
    onOpenChange(false);
  };

  const handleRecommended = async () => {
    const firstChannelId = selectedChannelIds[0] ?? null;
    const res = await slotMutation.mutateAsync(firstChannelId);
    const date = new Date(res.publish_date);
    setPublishDate(date);
    setTimeValue(`${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`);
  };

  const saving = createMutation.isPending || updateMutation.isPending || postNowMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl border-white/10 bg-[#0b0d13] text-zinc-100">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit post" : "New post"}</DialogTitle>
          <DialogDescription className="text-zinc-500">
            Compose once, tailor by channel, then save, schedule, or publish now.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-3">
              <Label className="text-xs text-zinc-500">Channels</Label>
              <div className="flex flex-wrap gap-2">
                {channels.map((channel) => {
                  const selected = selectedChannelIds.includes(channel.id);
                  return (
                    <button
                      key={channel.id}
                      type="button"
                      onClick={() => {
                        setSelectedChannelIds((current) => {
                          if (current.includes(channel.id)) return current.filter((id) => id !== channel.id);
                          return [...current, channel.id];
                        });
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1 text-xs",
                        selected ? "border-orange-400/40 bg-orange-500/10 text-orange-100" : "border-white/10 bg-white/5 text-zinc-300",
                      )}
                    >
                      {providerLabel(channel.provider)}
                    </button>
                  );
                })}
              </div>
            </div>

            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="bg-white/5">
                <TabsTrigger value="global">Global</TabsTrigger>
                {selectedChannelIds.map((id) => {
                  const channel = channels.find((ch) => ch.id === id);
                  if (!channel) return null;
                  const issues = perChannelValidation.get(id)?.issues ?? [];
                  const hasError = issues.some((i) => i.level === "error");
                  return (
                    <TabsTrigger key={id} value={id} className={cn(hasError && "text-red-200")}>
                      {providerLabel(channel.provider)}
                    </TabsTrigger>
                  );
                })}
              </TabsList>

              <TabsContent value="global" className="mt-4 space-y-4">
                <div className="space-y-2">
                  <Label className="text-xs text-zinc-500">Message</Label>
                  <Textarea
                    value={globalContent}
                    onChange={(event) => setGlobalContent(event.target.value)}
                    placeholder="Write once, tailor per channel…"
                    className="min-h-32 border-white/10 bg-black/20 text-zinc-100"
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-500">Title (YouTube)</Label>
                    <Input
                      value={globalTitle ?? ""}
                      onChange={(event) => setGlobalTitle(event.target.value || null)}
                      placeholder="Optional title"
                      className="border-white/10 bg-black/20 text-zinc-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs text-zinc-500">State</Label>
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        variant={state === "DRAFT" ? "default" : "secondary"}
                        className={cn(
                          state === "DRAFT" ? "bg-white/10 text-zinc-100 hover:bg-white/15" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
                        )}
                        onClick={() => setState("DRAFT")}
                      >
                        Draft
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={state === "QUEUE" ? "default" : "secondary"}
                        className={cn(
                          state === "QUEUE" ? "bg-orange-500 text-white hover:bg-orange-500/90" : "border-white/10 bg-white/5 text-zinc-300 hover:bg-white/10",
                        )}
                        onClick={() => setState("QUEUE")}
                      >
                        Schedule
                      </Button>
                    </div>
                  </div>
                </div>

                <SchedulePopover
                  state={state}
                  publishDate={publishDate}
                  publishDateWithTime={publishDateWithTime}
                  timeValue={timeValue}
                  onPublishDateChange={setPublishDate}
                  onTimeValueChange={setTimeValue}
                  onRecommendedSlot={handleRecommended}
                  recommendedLoading={slotMutation.isPending}
                />

                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-zinc-100">Media</div>
                      <div className="mt-0.5 text-xs text-zinc-500">Attach finalized video or image assets.</div>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                      onClick={() => setMediaPickerOpen(true)}
                    >
                      <Wand2 className="mr-2 h-4 w-4" />
                      Select
                    </Button>
                  </div>

                  {globalMedia.length === 0 ? (
                    <div className="mt-3 rounded-md border border-dashed border-white/10 p-3 text-xs text-zinc-500">
                      No media attached.
                    </div>
                  ) : (
                    <ul className="mt-3 space-y-2">
                      {globalMedia.map((media) => {
                        const asset = assetsById.get(media.asset_id);
                        const label = asset?.original_file_name ?? asset?.file_name ?? media.asset_id;
                        const sizeLabel = asset?.file_size_bytes ? `${Math.round(asset.file_size_bytes / 1024 / 1024)} MB` : null;

                        return (
                          <li
                            key={media.asset_id}
                            className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2"
                          >
                            <div className="min-w-0">
                              <div className="truncate text-xs font-medium text-zinc-200">{label}</div>
                              <div className="text-[11px] text-zinc-500">{sizeLabel ?? media.mime_type ?? ""}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setGlobalMedia((current) => current.filter((item) => item.asset_id !== media.asset_id))}
                              className="rounded-md border border-white/10 bg-black/20 p-1 text-zinc-300 hover:bg-black/30"
                              aria-label="Remove media"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </TabsContent>

              {selectedChannelIds.map((id) => {
                const channel = channels.find((ch) => ch.id === id);
                if (!channel) return null;
                const issues = perChannelValidation.get(id)?.issues ?? [];
                const override = overrides[id] ?? {};
                return (
                  <TabsContent key={id} value={id} className="mt-4 space-y-4">
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-zinc-100">{providerLabel(channel.provider)}</div>
                          <div className="mt-0.5 text-xs text-zinc-500">Overrides fall back to Global values.</div>
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                          onClick={() => {
                            setOverrides((current) => {
                              const next = { ...current };
                              delete next[id];
                              return next;
                            });
                          }}
                        >
                          Use global
                        </Button>
                      </div>

                      <div className="mt-3 space-y-2">
                        <Label className="text-xs text-zinc-500">Message override</Label>
                        <Textarea
                          value={override.content ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            setOverrides((current) => ({ ...current, [id]: { ...current[id], content: value || undefined } }));
                          }}
                          placeholder={globalContent || "(falls back to global message)"}
                          className="min-h-28 border-white/10 bg-black/20 text-zinc-100"
                        />
                      </div>

                      <div className="mt-3 space-y-2">
                        <Label className="text-xs text-zinc-500">Media override</Label>
                        <div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2">
                          <span className="text-xs text-zinc-400">
                            {(override.media ?? []).length > 0 ? `${(override.media ?? []).length} attached` : "Using global media"}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
                            onClick={() => {
                              setMediaPickerOpen(true);
                            }}
                          >
                            Select
                          </Button>
                        </div>
                      </div>

                      {issues.length > 0 && (
                        <div className="mt-4 space-y-2">
                          <Label className="text-xs text-zinc-500">Validation</Label>
                          <ul className="space-y-1 text-xs">
                            {issues.map((issue, idx) => (
                              <li
                                key={`${issue.message}-${idx}`}
                                className={cn(
                                  "rounded-md border px-3 py-2",
                                  issue.level === "error"
                                    ? "border-red-500/30 bg-red-500/10 text-red-200"
                                    : "border-amber-500/30 bg-amber-500/10 text-amber-200",
                                )}
                              >
                                {issue.message}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </TabsContent>
                );
              })}
            </Tabs>
          </div>

          <aside className="space-y-4">
            <PostPreview channels={channels} channelIds={selectedChannelIds} getContent={getContentForChannel} />

            {validation.length > 0 && hasBlockingIssues(validation) && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
                Fix validation errors before saving.
              </div>
            )}
          </aside>
        </div>

        <DialogFooter className="sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            {isEditing && (
              <>
                <Button
                  type="button"
                  variant="destructive"
                  className="bg-red-600 text-white hover:bg-red-600/90"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending || postNowMutation.isPending}
                >
                  {deleteMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Delete
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  className="border-orange-400/30 bg-orange-500/10 text-orange-100 hover:bg-orange-500/15"
                  onClick={handlePostNow}
                  disabled={saving}
                >
                  {postNowMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                  Post now
                </Button>
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              className="bg-orange-500 text-white hover:bg-orange-500/90"
              onClick={handleSave}
              disabled={saving || selectedChannelIds.length === 0}
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
              {isEditing ? "Save" : "Create"}
            </Button>
          </div>
        </DialogFooter>

        <MediaPicker
          open={mediaPickerOpen}
          onOpenChange={setMediaPickerOpen}
          assets={assets}
          value={tab === "global" ? globalMedia : overrides[tab]?.media ?? globalMedia}
          onChange={(next) => {
            if (tab === "global") {
              setGlobalMedia(next);
              return;
            }
            setOverrides((current) => ({ ...current, [tab]: { ...current[tab], media: next } }));
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
