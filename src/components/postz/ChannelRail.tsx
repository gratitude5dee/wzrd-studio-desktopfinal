import { Plus, RefreshCw } from "lucide-react";

import type { PostzChannel } from "@/types/postz";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { channelStatusClass, channelStatusLabel, providerLabel, POSTZ_PROVIDER_META } from "@/components/postz/postzMeta";

function initials(input: string) {
  const parts = input.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts.length > 1 ? parts[1][0] : parts[0]?.[1];
  return (first + (second ?? "")).toUpperCase();
}

export function ChannelRail({
  channels,
  isLoading,
  onSeedDemo,
  seedLoading,
  onAddChannel,
}: {
  channels: PostzChannel[];
  isLoading?: boolean;
  seedLoading?: boolean;
  onSeedDemo?: () => void;
  onAddChannel?: () => void;
}) {
  return (
    <Card className="rounded-lg border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">Channels</h2>
            <Badge variant="secondary" className="border-white/10 bg-white/5 text-zinc-300">
              {channels.length}
            </Badge>
          </div>
          <p className="mt-1 text-xs text-zinc-500">Connected accounts for scheduled publishing.</p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          className="border-white/10 bg-white/5 text-zinc-100 hover:bg-white/10"
          onClick={onAddChannel}
          disabled={!onAddChannel}
          aria-label="Add channel"
        >
          <Plus className="mr-1 h-4 w-4" />
          Add
        </Button>
      </div>

      {isLoading ? (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-zinc-400">Loading channels…</div>
      ) : channels.length === 0 ? (
        <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-4">
          <p className="text-sm font-medium text-zinc-200">No channels yet.</p>
          <p className="mt-1 text-xs text-zinc-500">Connect a channel to publish, or create demo channels to explore without posting.</p>
          {onSeedDemo && (
            <Button
              type="button"
              size="sm"
              className="mt-3 bg-orange-500 text-white hover:bg-orange-500/90"
              onClick={onSeedDemo}
              disabled={seedLoading}
            >
              <RefreshCw className={cn("mr-2 h-4 w-4", seedLoading && "animate-spin")} />
              Create demo channels
            </Button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {channels.map((channel) => {
            const providerMeta = POSTZ_PROVIDER_META[channel.provider] ?? null;
            const display = channel.name ?? channel.username ?? providerLabel(channel.provider);
            return (
              <div
                key={channel.id}
                className="flex items-center gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2"
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={channel.picture ?? undefined} alt={display} />
                  <AvatarFallback className="bg-white/5 text-xs text-zinc-200">
                    {initials(display)}
                  </AvatarFallback>
                </Avatar>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-sm font-medium text-zinc-100">{display}</span>
                    <Badge
                      variant="secondary"
                      className={cn(
                        "border text-[10px] uppercase tracking-wide",
                        providerMeta?.colorClass ?? "border-white/10 bg-white/5 text-zinc-300",
                      )}
                    >
                      {providerLabel(channel.provider)}
                    </Badge>
                  </div>
                  {channel.username && (
                    <div className="truncate text-xs text-zinc-500">{channel.username}</div>
                  )}
                </div>

                <Badge
                  variant="secondary"
                  className={cn("border text-[10px] uppercase", channelStatusClass(channel.status))}
                >
                  {channelStatusLabel(channel.status)}
                </Badge>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
