import { Loader2 } from "lucide-react";
import { toast } from "sonner";

import type { PostzOAuthProviderSummary } from "@/types/postz";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getDesktopDeepLink, openExternalUrl } from "@/lib/desktop";
import { usePostzOauthProviders, useStartPostzOauth } from "@/hooks/usePostz";
import { POSTZ_PROVIDER_META, providerLabel } from "@/components/postz/postzMeta";

function ProviderRow({
  provider,
  onConnect,
  connecting,
}: {
  provider: PostzOAuthProviderSummary;
  onConnect: (identifier: string) => void;
  connecting: boolean;
}) {
  const meta = POSTZ_PROVIDER_META[provider.identifier] ?? null;
  const label = meta?.label ?? provider.name ?? providerLabel(provider.identifier);
  const connectable = provider.connectable ?? (provider.configured && provider.implemented);
  const statusCopy = !provider.implemented
    ? "Coming soon"
    : !provider.configured
      ? "Admin setup required"
      : "Ready";

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <div className="truncate text-sm font-medium text-zinc-100">{label}</div>
          <Badge
            variant="secondary"
            className={cn(
              "border text-[10px] uppercase tracking-wide",
              meta?.colorClass ?? "border-white/10 bg-white/5 text-zinc-300",
            )}
          >
            {provider.identifier}
          </Badge>
        </div>
        <div className="mt-0.5 text-xs text-zinc-500">{statusCopy}</div>
      </div>

      <Button
        type="button"
        size="sm"
        className="bg-orange-500 text-white hover:bg-orange-500/90"
        disabled={!connectable || connecting}
        onClick={() => onConnect(provider.identifier)}
      >
        {connecting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {provider.implemented ? "Connect" : "Soon"}
      </Button>
    </div>
  );
}

function getAppReturnUrl(): string | null {
  const desktopUrl = getDesktopDeepLink("/postz/connected");
  if (desktopUrl) return desktopUrl;
  if (typeof window === "undefined") return null;
  return `${window.location.origin}/postz/connected`;
}

export function AddChannelDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const providersQuery = usePostzOauthProviders({ enabled: open });
  const startOauth = useStartPostzOauth();

  const providers = (providersQuery.data ?? []) as PostzOAuthProviderSummary[];
  const isStarting = startOauth.isPending;

  const handleConnect = async (identifier: string) => {
    try {
      const result = await startOauth.mutateAsync({ provider: identifier, app_return_url: getAppReturnUrl() });
      const ok = await openExternalUrl(result.url);
      if (!ok) {
        toast.error("Unable to open browser", { description: "Copy the URL from the logs and open it manually." });
      } else {
        toast.message("Continue in your browser", {
          description: "After connecting, WZRD will refocus Postz automatically.",
        });
      }
      onOpenChange(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      toast.error("Unable to start OAuth", { description: message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg border-white/10 bg-[#0b0c12] text-zinc-100">
        <DialogHeader>
          <DialogTitle>Add channel</DialogTitle>
          <DialogDescription className="text-zinc-400">
            Connect a social account via OAuth. Admin setup means the provider needs Supabase Function secrets before users can connect.
          </DialogDescription>
        </DialogHeader>

        {providersQuery.isLoading ? (
          <div className="flex items-center justify-center rounded-lg border border-white/10 bg-white/[0.03] py-10 text-zinc-500">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : providersQuery.isError ? (
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
            Unable to load providers.
          </div>
        ) : (
          <div className="space-y-2">
            {providers.length === 0 ? (
              <div className="rounded-lg border border-dashed border-white/10 bg-black/10 p-4 text-sm text-zinc-500">
                No providers available.
              </div>
            ) : (
              providers.map((provider) => (
                <ProviderRow
                  key={provider.identifier}
                  provider={provider}
                  onConnect={handleConnect}
                  connecting={isStarting && (
                    startOauth.variables === provider.identifier ||
                    (typeof startOauth.variables === "object" && startOauth.variables?.provider === provider.identifier)
                  )}
                />
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
