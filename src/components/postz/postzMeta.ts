import type { PostzChannelStatus, PostzPostState, PostzProvider } from "@/types/postz";

export const POSTZ_PROVIDER_META: Record<string, { label: string; colorClass: string }> = {
  tiktok: { label: "TikTok", colorClass: "bg-pink-500/15 text-pink-200 border-pink-500/20" },
  instagram: { label: "Instagram", colorClass: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/20" },
  "instagram-standalone": { label: "Instagram", colorClass: "bg-fuchsia-500/15 text-fuchsia-200 border-fuchsia-500/20" },
  youtube: { label: "YouTube", colorClass: "bg-red-500/15 text-red-200 border-red-500/20" },
  facebook: { label: "Facebook", colorClass: "bg-blue-500/15 text-blue-200 border-blue-500/20" },
  metaads: { label: "Meta Ads", colorClass: "bg-indigo-500/15 text-indigo-200 border-indigo-500/20" },
  x: { label: "X", colorClass: "bg-zinc-500/15 text-zinc-200 border-zinc-500/20" },
  threads: { label: "Threads", colorClass: "bg-zinc-500/15 text-zinc-200 border-zinc-500/20" },
  linkedin: { label: "LinkedIn", colorClass: "bg-sky-500/15 text-sky-200 border-sky-500/20" },
  "linkedin-page": { label: "LinkedIn Page", colorClass: "bg-sky-500/15 text-sky-200 border-sky-500/20" },
};

export function providerLabel(provider: PostzProvider): string {
  return POSTZ_PROVIDER_META[provider]?.label ?? provider;
}

export function channelStatusLabel(status: PostzChannelStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "needs_reauth":
      return "Reauth";
    case "disabled":
      return "Disabled";
    case "error":
      return "Error";
    default:
      return status;
  }
}

export function channelStatusClass(status: PostzChannelStatus): string {
  switch (status) {
    case "connected":
      return "bg-emerald-500/10 text-emerald-200 border-emerald-500/20";
    case "needs_reauth":
      return "bg-amber-500/10 text-amber-200 border-amber-500/20";
    case "disabled":
      return "bg-zinc-500/10 text-zinc-300 border-white/10";
    case "error":
      return "bg-red-500/10 text-red-200 border-red-500/20";
    default:
      return "bg-white/5 text-zinc-300 border-white/10";
  }
}

export function postStateLabel(state: PostzPostState): string {
  switch (state) {
    case "DRAFT":
      return "Draft";
    case "QUEUE":
      return "Scheduled";
    case "PUBLISHING":
      return "Publishing";
    case "PUBLISHED":
      return "Published";
    case "ERROR":
      return "Error";
    default:
      return state;
  }
}

export function postStateClass(state: PostzPostState): string {
  switch (state) {
    case "DRAFT":
      return "bg-white/5 text-zinc-300 border-white/10";
    case "QUEUE":
      return "bg-orange-500/10 text-orange-200 border-orange-500/20";
    case "PUBLISHED":
      return "bg-emerald-500/10 text-emerald-200 border-emerald-500/20";
    case "ERROR":
      return "bg-red-500/10 text-red-200 border-red-500/20";
    case "PUBLISHING":
      return "bg-sky-500/10 text-sky-200 border-sky-500/20";
    default:
      return "bg-white/5 text-zinc-300 border-white/10";
  }
}
