import { DndContext, DragEndEvent, PointerSensor, useDraggable, useDroppable, useSensor, useSensors } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { Clock } from "lucide-react";
import { useMemo } from "react";

import type { PostzChannel, PostzPost } from "@/types/postz";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { postStateClass, postStateLabel } from "@/components/postz/postzMeta";

const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfCalendarMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function buildCalendarDays(anchor: Date) {
  const first = startOfCalendarMonth(anchor);
  const start = new Date(first);
  start.setDate(first.getDate() - first.getDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start);
    day.setDate(start.getDate() + index);
    return day;
  });
}

function sameDay(left: Date, right: Date) {
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function ymd(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date);
}

type GroupSummary = {
  group_id: string;
  publish_date: Date;
  state: PostzPost["state"];
  content: string;
  channel_ids: string[];
  release_url: string | null;
  error: string | null;
};

function groupPosts(posts: PostzPost[]): GroupSummary[] {
  const byGroup = new Map<string, PostzPost[]>();
  for (const post of posts) {
    const list = byGroup.get(post.group_id) ?? [];
    list.push(post);
    byGroup.set(post.group_id, list);
  }

  const summaries: GroupSummary[] = [];
  for (const [groupId, groupPosts] of byGroup.entries()) {
    const sorted = [...groupPosts].sort((a, b) => new Date(a.publish_date).getTime() - new Date(b.publish_date).getTime());
    const first = sorted[0];
    summaries.push({
      group_id: groupId,
      publish_date: new Date(first.publish_date),
      state: first.state,
      content: first.content,
      channel_ids: sorted.map((p) => p.channel_id),
      release_url: sorted.find((p) => p.release_url)?.release_url ?? null,
      error: sorted.find((p) => p.error)?.error ?? null,
    });
  }

  return summaries.sort((a, b) => a.publish_date.getTime() - b.publish_date.getTime());
}

function DraggableGroupCard({
  group,
  channelsById,
  onClick,
}: {
  group: GroupSummary;
  channelsById: Map<string, PostzChannel>;
  onClick: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: `group:${group.group_id}` });

  const style = {
    transform: CSS.Translate.toString(transform),
  };

  const visibleChannels = group.channel_ids
    .map((id) => channelsById.get(id))
    .filter((ch): ch is PostzChannel => Boolean(ch))
    .slice(0, 3);

  const remaining = Math.max(group.channel_ids.length - visibleChannels.length, 0);

  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={onClick}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        "w-full rounded-md border border-white/10 bg-[#151820] px-2 py-1 text-left transition",
        "hover:border-white/20 hover:bg-[#1b202b]",
        isDragging && "opacity-70",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1 text-[11px] text-orange-100">
          <Clock className="h-3 w-3" />
          {timeLabel(group.publish_date)}
        </div>
        <Badge variant="secondary" className={cn("border text-[10px] uppercase", postStateClass(group.state))}>
          {postStateLabel(group.state)}
        </Badge>
      </div>
      <div className="mt-0.5 line-clamp-2 text-xs text-zinc-200">
        {group.content?.trim() ? group.content : "(empty)"}
      </div>
      {group.state === "PUBLISHED" && group.release_url && (
        <div className="mt-1 truncate text-[11px] text-emerald-200">Live: {group.release_url}</div>
      )}
      {group.state === "ERROR" && group.error && (
        <div className="mt-1 line-clamp-1 text-[11px] text-red-200">{group.error.replace(/^\[(retryable|terminal)\]\s*/, "")}</div>
      )}
      <div className="mt-1 flex items-center gap-1">
        {visibleChannels.map((channel) => (
          <span
            key={channel.id}
            title={channel.name ?? channel.username ?? channel.provider}
            className="h-5 w-5 overflow-hidden rounded-full border border-white/10 bg-white/5"
          >
            {channel.picture ? (
              <img src={channel.picture} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[10px] text-zinc-300">
                {(channel.provider ?? "?").slice(0, 1).toUpperCase()}
              </span>
            )}
          </span>
        ))}
        {remaining > 0 && (
          <span className="text-[10px] text-zinc-500">+{remaining}</span>
        )}
      </div>
    </button>
  );
}

function DroppableDayCell({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={cn("min-h-28 border-b border-r border-white/10 p-2", isOver && "bg-orange-500/5")}
    >
      {children}
    </div>
  );
}

export function PostzCalendar({
  anchor,
  posts,
  channels,
  onCreateAt,
  onEditGroup,
  onMoveGroup,
}: {
  anchor: Date;
  posts: PostzPost[];
  channels: PostzChannel[];
  onCreateAt: (date: Date) => void;
  onEditGroup: (groupId: string) => void;
  onMoveGroup: (groupId: string, targetDay: Date) => void;
}) {
  const today = useMemo(() => new Date(), []);
  const days = useMemo(() => buildCalendarDays(anchor), [anchor]);
  const groups = useMemo(() => groupPosts(posts), [posts]);
  const channelsById = useMemo(() => new Map(channels.map((ch) => [ch.id, ch])), [channels]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const groupsByDay = useMemo(() => {
    const map = new Map<string, GroupSummary[]>();
    for (const group of groups) {
      const key = ymd(group.publish_date);
      const list = map.get(key) ?? [];
      list.push(group);
      map.set(key, list);
    }
    return map;
  }, [groups]);

  const handleDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId) return;
    if (!activeId.startsWith("group:")) return;
    if (!overId.startsWith("day:")) return;

    const groupId = activeId.replace("group:", "");
    const dayKey = overId.replace("day:", "");
    const [year, month, day] = dayKey.split("-").map((v) => Number(v));
    if (!year || !month || !day) return;

    onMoveGroup(groupId, new Date(year, month - 1, day));
  };

  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
      <div className="grid grid-cols-7 border-b border-white/10 bg-white/[0.02]">
        {weekdayLabels.map((weekday) => (
          <div key={weekday} className="px-3 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
            {weekday}
          </div>
        ))}
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-7">
          {days.map((day) => {
            const outsideMonth = day.getMonth() !== anchor.getMonth();
            const dayKey = ymd(day);
            const dayGroups = groupsByDay.get(dayKey) ?? [];

            return (
              <DroppableDayCell key={dayKey} id={`day:${dayKey}`}>
                <button
                  type="button"
                  onClick={() => onCreateAt(day)}
                  className="mb-2 flex w-full items-center justify-between"
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                      sameDay(day, today) ? "bg-orange-500 text-white" : "text-zinc-400",
                      outsideMonth && "text-zinc-700",
                    )}
                  >
                    {day.getDate()}
                  </span>
                </button>

                <div className={cn("space-y-1", outsideMonth && "opacity-50")}>
                  {dayGroups.slice(0, 3).map((group) => (
                    <DraggableGroupCard
                      key={group.group_id}
                      group={group}
                      channelsById={channelsById}
                      onClick={() => onEditGroup(group.group_id)}
                    />
                  ))}
                  {dayGroups.length > 3 && (
                    <div className="text-[11px] text-zinc-500">+{dayGroups.length - 3} more</div>
                  )}
                </div>
              </DroppableDayCell>
            );
          })}
        </div>
      </DndContext>
    </div>
  );
}
